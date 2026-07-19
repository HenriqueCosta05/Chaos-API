package config

import (
	"fmt"
	"os"
	"reflect"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/HenriqueCosta05/Chaos-API/application/pkg/models"
)

// Load loads configuration from YAML file with env var overrides
func Load(path string) (*models.Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config file: %w", err)
	}

	var cfg models.Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse YAML: %w", err)
	}

	// Apply environment variable overrides
	applyEnvOverrides(&cfg)

	// Set defaults
	setDefaults(&cfg)

	// Validate
	if err := validate(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func applyEnvOverrides(cfg *models.Config) {
	envMappings := map[string]interface{}{
		"CHAOSAPI_SERVER_PORT":             &cfg.Server.Port,
		"CHAOSAPI_SERVER_READ_TIMEOUT":     &cfg.Server.ReadTimeout,
		"CHAOSAPI_SERVER_WRITE_TIMEOUT":    &cfg.Server.WriteTimeout,
		"CHAOSAPI_SERVER_IDLE_TIMEOUT":     &cfg.Server.IdleTimeout,
		"CHAOSAPI_UPSTREAM_URL":            &cfg.Upstream.URL,
		"CHAOSAPI_UPSTREAM_TIMEOUT":        &cfg.Upstream.Timeout,
		"CHAOSAPI_UPSTREAM_TLS_SKIP_VERIFY": &cfg.Upstream.TLSSkipVerify,
		"CHAOSAPI_UPSTREAM_MAX_IDLE_CONNS": &cfg.Upstream.MaxIdleConns,
		"CHAOSAPI_UPSTREAM_MAX_CONNS_HOST": &cfg.Upstream.MaxConnsPerHost,
		"CHAOSAPI_METRICS_ENABLED":         &cfg.Metrics.Enabled,
		"CHAOSAPI_METRICS_PORT":            &cfg.Metrics.Port,
		"CHAOSAPI_METRICS_PATH":            &cfg.Metrics.Path,
		"CHAOSAPI_LOG_LEVEL":               &cfg.Logging.Level,
		"CHAOSAPI_LOG_FORMAT":              &cfg.Logging.Format,
		"CHAOSAPI_LOG_SAMPLE_RATE":         &cfg.Logging.SampleRate,
		"CHAOSAPI_LOG_MAX_BODY_BYTES":      &cfg.Logging.MaxBodyLogBytes,
		"CHAOSAPI_ADMIN_ENABLED":           &cfg.AdminAPI.Enabled,
		"CHAOSAPI_ADMIN_PORT":              &cfg.AdminAPI.Port,
		"CHAOSAPI_ADMIN_API_KEY":           &cfg.AdminAPI.APIKey,
		"CHAOSAPI_ADMIN_MTLS":              &cfg.AdminAPI.MTLS,
		"CHAOSAPI_HOTRELOAD_ENABLED":       &cfg.HotReload.Enabled,
		"CHAOSAPI_HOTRELOAD_SIGNAL":        &cfg.HotReload.Signal,
		"CHAOSAPI_HOTRELOAD_DEBOUNCE_MS":   &cfg.HotReload.DebounceMs,
	}

	for envKey, target := range envMappings {
		if value := os.Getenv(envKey); value != "" {
			setFieldByReflection(target, value)
		}
	}
}

func setFieldByReflection(target interface{}, value string) {
	v := reflect.ValueOf(target)
	if v.Kind() != reflect.Ptr || v.IsNil() {
		return
	}
	v = v.Elem()
	if !v.CanSet() {
		return
	}

	switch v.Kind() {
	case reflect.Int:
		var intVal int
		fmt.Sscanf(value, "%d", &intVal)
		v.SetInt(int64(intVal))
	case reflect.Bool:
		boolVal := value == "true" || value == "1" || value == "yes"
		v.SetBool(boolVal)
	case reflect.String:
		v.SetString(value)
	case reflect.Struct:
		if v.Type() == reflect.TypeOf(time.Duration(0)) {
			if d, err := time.ParseDuration(value); err == nil {
				v.Set(reflect.ValueOf(d))
			}
		}
	}
}

func setDefaults(cfg *models.Config) {
	if cfg.Server.Port == 0 {
		cfg.Server.Port = 8080
	}
	if cfg.Server.ReadTimeout == 0 {
		cfg.Server.ReadTimeout = 30 * time.Second
	}
	if cfg.Server.WriteTimeout == 0 {
		cfg.Server.WriteTimeout = 30 * time.Second
	}
	if cfg.Server.IdleTimeout == 0 {
		cfg.Server.IdleTimeout = 120 * time.Second
	}

	if cfg.Upstream.Timeout == 0 {
		cfg.Upstream.Timeout = 10 * time.Second
	}
	if cfg.Upstream.MaxIdleConns == 0 {
		cfg.Upstream.MaxIdleConns = 100
	}
	if cfg.Upstream.MaxConnsPerHost == 0 {
		cfg.Upstream.MaxConnsPerHost = 100
	}

	if cfg.Metrics.Port == 0 {
		cfg.Metrics.Port = 9090
	}
	if cfg.Metrics.Path == "" {
		cfg.Metrics.Path = "/metrics"
	}

	if cfg.Logging.Level == "" {
		cfg.Logging.Level = "info"
	}
	if cfg.Logging.Format == "" {
		cfg.Logging.Format = "json"
	}
	if cfg.Logging.SampleRate == 0 {
		cfg.Logging.SampleRate = 0.1
	}
	if cfg.Logging.MaxBodyLogBytes == 0 {
		cfg.Logging.MaxBodyLogBytes = 1024
	}

	if cfg.AdminAPI.Enabled && cfg.AdminAPI.Port == 0 {
		cfg.AdminAPI.Port = 8081
	}

	if cfg.HotReload.DebounceMs == 0 {
		cfg.HotReload.DebounceMs = 100
	}
	cfg.HotReload.Debounce = time.Duration(cfg.HotReload.DebounceMs) * time.Millisecond
}

func validate(cfg *models.Config) error {
	if cfg.Server.Port <= 0 || cfg.Server.Port > 65535 {
		return fmt.Errorf("server.port: must be between 1 and 65535")
	}

	if cfg.Upstream.URL == "" {
		return fmt.Errorf("upstream.url: required")
	}

	for i, policy := range cfg.Policies {
		if err := policy.Validate(); err != nil {
			return fmt.Errorf("policies[%d]: %w", i, err)
		}
		for j := i + 1; j < len(cfg.Policies); j++ {
			if cfg.Policies[j].Name == policy.Name {
				return fmt.Errorf("policies[%d] and policies[%d]: duplicate name %q", i, j, policy.Name)
			}
		}
	}

	if cfg.Metrics.Enabled && (cfg.Metrics.Port <= 0 || cfg.Metrics.Port > 65535) {
		return fmt.Errorf("metrics.port: must be between 1 and 65535")
	}

	if cfg.AdminAPI.Enabled && (cfg.AdminAPI.Port <= 0 || cfg.AdminAPI.Port > 65535) {
		return fmt.Errorf("admin_api.port: must be between 1 and 65535")
	}
	if cfg.AdminAPI.Enabled && cfg.AdminAPI.Port == cfg.Server.Port {
		return fmt.Errorf("admin_api.port: cannot be same as server.port")
	}

	if cfg.HotReload.Enabled {
		validSignals := map[string]bool{"SIGHUP": true, "SIGUSR1": true}
		if !validSignals[cfg.HotReload.Signal] {
			return fmt.Errorf("hot_reload.signal: must be SIGHUP or SIGUSR1")
		}
	}

	return nil
}

// EnvVars returns the list of supported environment variables for documentation
var EnvVars = []string{
	"CHAOSAPI_SERVER_PORT",
	"CHAOSAPI_SERVER_READ_TIMEOUT",
	"CHAOSAPI_SERVER_WRITE_TIMEOUT",
	"CHAOSAPI_SERVER_IDLE_TIMEOUT",
	"CHAOSAPI_UPSTREAM_URL",
	"CHAOSAPI_UPSTREAM_TIMEOUT",
	"CHAOSAPI_UPSTREAM_TLS_SKIP_VERIFY",
	"CHAOSAPI_UPSTREAM_MAX_IDLE_CONNS",
	"CHAOSAPI_UPSTREAM_MAX_CONNS_HOST",
	"CHAOSAPI_METRICS_ENABLED",
	"CHAOSAPI_METRICS_PORT",
	"CHAOSAPI_METRICS_PATH",
	"CHAOSAPI_LOG_LEVEL",
	"CHAOSAPI_LOG_FORMAT",
	"CHAOSAPI_LOG_SAMPLE_RATE",
	"CHAOSAPI_LOG_MAX_BODY_BYTES",
	"CHAOSAPI_ADMIN_ENABLED",
	"CHAOSAPI_ADMIN_PORT",
	"CHAOSAPI_ADMIN_API_KEY",
	"CHAOSAPI_ADMIN_MTLS",
	"CHAOSAPI_HOTRELOAD_ENABLED",
	"CHAOSAPI_HOTRELOAD_SIGNAL",
	"CHAOSAPI_HOTRELOAD_DEBOUNCE_MS",
}