package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/HenriqueCosta05/Chaos-API/internal/admin"
	"github.com/HenriqueCosta05/Chaos-API/internal/config"
	"github.com/HenriqueCosta05/Chaos-API/internal/health"
	"github.com/HenriqueCosta05/Chaos-API/internal/logging"
	"github.com/HenriqueCosta05/Chaos-API/internal/metrics"
	"github.com/HenriqueCosta05/Chaos-API/internal/policy"
	"github.com/HenriqueCosta05/Chaos-API/internal/proxy"
	"github.com/HenriqueCosta05/Chaos-API/pkg/models"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

var (
	version = "dev"
	commit  = "none"
	date    = "unknown"
)

func main() {
	var (
		configPath  = flag.String("config", "configs/chaosapi.yaml", "Path to config file")
		showVersion = flag.Bool("version", false, "Show version and exit")
	)
	flag.Parse()

	if *showVersion {
		fmt.Printf("ChaosAPI %s (commit: %s, built: %s)\n", version, commit, date)
		os.Exit(0)
	}

	// Load configuration
	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatal().Err(err).Str("config", *configPath).Msg("Failed to load config")
	}

	// Setup logging
	logger := logging.Setup(logging.Config{
		Level:           cfg.Logging.Level,
		Format:          cfg.Logging.Format,
		SampleRate:      cfg.Logging.SampleRate,
		MaxBodyLogBytes: cfg.Logging.MaxBodyLogBytes,
	})
	log.Logger = logger

	logger.Info().
		Str("version", version).
		Str("commit", commit).
		Str("date", date).
		Str("config", *configPath).
		Msg("Starting ChaosAPI")

		// Initialize policy engine
	policyEngine := policy.NewEngine()
	policies := make([]models.Policy, len(cfg.Policies))
	for i := range cfg.Policies {
		policies[i] = cfg.Policies[i]
	}
	policyEngine.SetPolicies(policies)

	// Parse upstream URL
	upstreamURL, err := policy.ParseURL(cfg.Upstream.URL)
	if err != nil {
		log.Fatal().Err(err).Str("url", cfg.Upstream.URL).Msg("Invalid upstream URL")
	}

	// Create metrics
	metricsInstance := metrics.New(cfg.Metrics.Enabled)

	// Create reverse proxy
	chaosProxy, err := proxy.NewProxy(&proxy.ProxyConfig{
		UpstreamURL:    upstreamURL,
		UpstreamConfig: &cfg.Upstream,
		PolicyEngine:   policyEngine,
		Metrics:        metricsInstance,
		Logger:         logger,
	})
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create proxy")
	}

	// Initialize metrics server
	var metricsServer *http.Server
	if cfg.Metrics.Enabled {
		metricsServer = &http.Server{
			Addr:    fmt.Sprintf(":%d", cfg.Metrics.Port),
			Handler: promhttp.Handler(),
		}
		go func() {
			logger.Info().Int("port", cfg.Metrics.Port).Msg("Starting metrics server")
			if err := metricsServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				logger.Error().Err(err).Msg("Metrics server error")
			}
		}()
	}

	// Initialize health checks
	healthChecker := health.NewHealthChecker(cfg.Upstream.URL, 10*time.Second)

	// Create main router
	r := chi.NewRouter()
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(logging.Middleware(logger))
	r.Use(chimiddleware.Recoverer)
	r.Use(metrics.Middleware(metricsInstance))

	// Health endpoints
	r.Get("/healthz", healthChecker.LivenessHandler)
	r.Get("/readyz", healthChecker.ReadinessHandler)

	// Admin API
	var adminServer *admin.AdminServer
	if cfg.AdminAPI.Enabled {
		adminServer = admin.NewAdminServer(*configPath, func() error {
			policyEngine.SetPolicies(adminServer.GetPolicies())
			metricsInstance.IncConfigReload("success")
			return nil
		}, cfg.AdminAPI.APIKey)
		adminServer.SetPolicies(policies)
		r.Mount("/admin", adminServer.Router())
	}

	// Proxy all other requests
	r.HandleFunc("/*", chaosProxy.ServeHTTP)

	// Create main server
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      r,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		IdleTimeout:  cfg.Server.IdleTimeout,
	}

	// Start health checker
	go healthChecker.Start(context.Background())

	// Start server
	go func() {
		logger.Info().Int("port", cfg.Server.Port).Msg("Starting HTTP server")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal().Err(err).Msg("Server error")
		}
	}()

	// Setup hot reload if enabled
	if cfg.HotReload.Enabled {
		setupHotReload(cfg, policyEngine, adminServer, metricsInstance, *configPath, logger)
	}

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info().Msg("Shutting down server...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	healthChecker.Stop()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error().Err(err).Msg("Server forced to shutdown")
	}

	if metricsServer != nil {
		metricsServer.Shutdown(ctx)
	}

	logger.Info().Msg("Server exited")
}

func setupHotReload(cfg *models.Config, engine *policy.Engine, adminServer *admin.AdminServer, metricsInstance *metrics.Metrics, configPath string, logger zerolog.Logger) {
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGHUP)
		for range sigChan {
			logger.Info().Msg("Received SIGHUP, reloading config...")
			newCfg, err := config.Load(configPath)
			if err != nil {
				logger.Error().Err(err).Msg("Config reload failed")
				metricsInstance.IncConfigReload("failed")
				continue
			}
			policies := make([]models.Policy, len(newCfg.Policies))
			for i := range newCfg.Policies {
				policies[i] = newCfg.Policies[i]
			}
			engine.SetPolicies(policies)
			if adminServer != nil {
				adminServer.SetPolicies(policies)
			}
			metricsInstance.IncConfigReload("success")
			logger.Info().Int("policies", len(policies)).Msg("Config reloaded")
		}
	}()
}
