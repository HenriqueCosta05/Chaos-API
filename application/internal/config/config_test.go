package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func writeConfig(t *testing.T, yaml string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "chaosapi.yaml")
	require.NoError(t, os.WriteFile(path, []byte(yaml), 0o644))
	return path
}

const minimalValidYAML = `
server:
  port: 8080
upstream:
  url: "https://example.com"
`

func TestLoad_ValidMinimalConfigAppliesDefaults(t *testing.T) {
	path := writeConfig(t, minimalValidYAML)

	cfg, err := Load(path)
	require.NoError(t, err)

	assert.Equal(t, 8080, cfg.Server.Port)
	assert.Equal(t, "https://example.com", cfg.Upstream.URL)
	assert.Equal(t, 30*time.Second, cfg.Server.ReadTimeout)
	assert.Equal(t, 10*time.Second, cfg.Upstream.Timeout)
	assert.Equal(t, 100, cfg.Upstream.MaxIdleConns)
	assert.Equal(t, 9090, cfg.Metrics.Port)
	assert.Equal(t, "/metrics", cfg.Metrics.Path)
	assert.Equal(t, "info", cfg.Logging.Level)
	assert.Equal(t, "json", cfg.Logging.Format)
}

func TestLoad_MissingFileReturnsError(t *testing.T) {
	_, err := Load(filepath.Join(t.TempDir(), "does-not-exist.yaml"))
	assert.Error(t, err)
}

func TestLoad_InvalidYAMLReturnsError(t *testing.T) {
	path := writeConfig(t, "server:\n  port: [this is not valid\n")
	_, err := Load(path)
	assert.Error(t, err)
}

func TestLoad_MissingUpstreamURLFailsValidation(t *testing.T) {
	path := writeConfig(t, "server:\n  port: 8080\n")
	_, err := Load(path)
	assert.ErrorContains(t, err, "upstream.url")
}

func TestLoad_InvalidServerPortFailsValidation(t *testing.T) {
	path := writeConfig(t, "server:\n  port: 70000\nupstream:\n  url: \"https://example.com\"\n")
	_, err := Load(path)
	assert.ErrorContains(t, err, "server.port")
}

func TestLoad_DuplicatePolicyNamesFailsValidation(t *testing.T) {
	yaml := minimalValidYAML + `
policies:
  - name: "dup"
    selector: {}
    disconnect: {}
  - name: "dup"
    selector: {}
    disconnect: {}
`
	path := writeConfig(t, yaml)
	_, err := Load(path)
	assert.ErrorContains(t, err, "duplicate name")
}

func TestLoad_AdminPortSameAsServerPortFailsValidation(t *testing.T) {
	yaml := minimalValidYAML + `
admin_api:
  enabled: true
  port: 8080
`
	path := writeConfig(t, yaml)
	_, err := Load(path)
	assert.ErrorContains(t, err, "admin_api.port")
}

func TestLoad_InvalidHotReloadSignalFailsValidation(t *testing.T) {
	yaml := minimalValidYAML + `
hot_reload:
  enabled: true
  signal: "SIGKILL"
`
	path := writeConfig(t, yaml)
	_, err := Load(path)
	assert.ErrorContains(t, err, "hot_reload.signal")
}

func TestLoad_EnvVarOverridesServerPort(t *testing.T) {
	path := writeConfig(t, minimalValidYAML)
	t.Setenv("CHAOSAPI_SERVER_PORT", "9999")

	cfg, err := Load(path)
	require.NoError(t, err)
	assert.Equal(t, 9999, cfg.Server.Port)
}

func TestLoad_EnvVarOverridesUpstreamURL(t *testing.T) {
	path := writeConfig(t, minimalValidYAML)
	t.Setenv("CHAOSAPI_UPSTREAM_URL", "https://override.example.com")

	cfg, err := Load(path)
	require.NoError(t, err)
	assert.Equal(t, "https://override.example.com", cfg.Upstream.URL)
}

func TestLoad_EnvVarOverridesBoolField(t *testing.T) {
	path := writeConfig(t, minimalValidYAML)
	t.Setenv("CHAOSAPI_METRICS_ENABLED", "true")
	t.Setenv("CHAOSAPI_METRICS_PORT", "9200")

	cfg, err := Load(path)
	require.NoError(t, err)
	assert.True(t, cfg.Metrics.Enabled)
	assert.Equal(t, 9200, cfg.Metrics.Port)
}

func TestLoad_EnvVarOverridesDurationField(t *testing.T) {
	path := writeConfig(t, minimalValidYAML)
	t.Setenv("CHAOSAPI_UPSTREAM_TIMEOUT", "5s")

	cfg, err := Load(path)
	require.NoError(t, err)
	assert.Equal(t, 5*time.Second, cfg.Upstream.Timeout)
}

func TestLoad_EnvVarOverridesFloatField(t *testing.T) {
	path := writeConfig(t, minimalValidYAML)
	t.Setenv("CHAOSAPI_LOG_SAMPLE_RATE", "0.5")

	cfg, err := Load(path)
	require.NoError(t, err)
	assert.Equal(t, 0.5, cfg.Logging.SampleRate)
}
