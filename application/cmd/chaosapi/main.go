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
	if cfg.AdminAPI.Enabled {
		adminRouter := createAdminRouter(policyEngine, cfg, logger)
		r.Mount("/admin", adminRouter)
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
		setupHotReload(cfg, policyEngine, metricsInstance, *configPath, logger)
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

func createAdminRouter(engine *policy.Engine, cfg *models.Config, logger zerolog.Logger) http.Handler {
	r := chi.NewRouter()

	// API key auth middleware
	if cfg.AdminAPI.APIKey != "" {
		r.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				key := r.Header.Get("X-API-Key")
				if key != cfg.AdminAPI.APIKey {
					http.Error(w, "Unauthorized", http.StatusUnauthorized)
					return
				}
				next.ServeHTTP(w, r)
			})
		})
	}

	r.Get("/policies", func(w http.ResponseWriter, r *http.Request) {
		policies := engine.GetPolicies()
		writeJSON(w, http.StatusOK, map[string]any{
			"data": policies,
			"meta": map[string]string{"request_id": r.Header.Get("X-Request-ID")},
		})
	})

	r.Post("/policies", func(w http.ResponseWriter, r *http.Request) {
		var pol models.Policy
		if err := readJSON(r, &pol); err != nil {
			writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
			return
		}
		if err := pol.Validate(); err != nil {
			writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{
			"data": pol,
			"meta": map[string]string{"request_id": r.Header.Get("X-Request-ID")},
		})
	})

	r.Get("/policies/{name}", func(w http.ResponseWriter, r *http.Request) {
		name := chi.URLParam(r, "name")
		for _, p := range engine.GetPolicies() {
			if p.Name == name {
				writeJSON(w, http.StatusOK, map[string]any{
					"data": p,
					"meta": map[string]string{"request_id": r.Header.Get("X-Request-ID")},
				})
				return
			}
		}
		writeError(w, http.StatusNotFound, "NOT_FOUND", "policy not found")
	})

	r.Put("/policies/{name}", func(w http.ResponseWriter, r *http.Request) {
		name := chi.URLParam(r, "name")
		var pol models.Policy
		if err := readJSON(r, &pol); err != nil {
			writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
			return
		}
		if pol.Name != name {
			writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", "name in body must match URL")
			return
		}
		if err := pol.Validate(); err != nil {
			writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"data": pol,
			"meta": map[string]string{"request_id": r.Header.Get("X-Request-ID")},
		})
	})

	r.Delete("/policies/{name}", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"data": map[string]string{"deleted": chi.URLParam(r, "name")},
			"meta": map[string]string{"request_id": r.Header.Get("X-Request-ID")},
		})
	})

	r.Post("/reload", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"data": map[string]string{"status": "reload triggered"},
			"meta": map[string]string{"request_id": r.Header.Get("X-Request-ID")},
		})
	})

	return r
}

func setupHotReload(cfg *models.Config, engine *policy.Engine, metricsInstance *metrics.Metrics, configPath string, logger zerolog.Logger) {
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
			metricsInstance.IncConfigReload("success")
			logger.Info().Int("policies", len(policies)).Msg("Config reloaded")
		}
	}()
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
}

func readJSON(r *http.Request, v any) error {
	return nil
}
