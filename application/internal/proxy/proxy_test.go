package proxy

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync/atomic"
	"testing"
	"time"

	"github.com/HenriqueCosta05/Chaos-API/internal/metrics"
	"github.com/HenriqueCosta05/Chaos-API/internal/policy"
	"github.com/HenriqueCosta05/Chaos-API/pkg/models"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newTestProxy builds a Proxy in front of downstreamURL with a single policy
// (nil means passthrough, no policy configured) and returns an httptest.Server
// exposing it.
func newTestProxy(t *testing.T, downstreamURL string, pol *models.Policy) *httptest.Server {
	t.Helper()

	u, err := url.Parse(downstreamURL)
	require.NoError(t, err)

	engine := policy.NewEngine()
	if pol != nil {
		require.NoError(t, pol.Selector.Compile())
		engine.SetPolicies([]models.Policy{*pol})
	}

	p, err := NewProxy(&ProxyConfig{
		UpstreamURL: u,
		UpstreamConfig: &models.UpstreamConfig{
			Timeout:         2 * time.Second,
			MaxIdleConns:    10,
			MaxConnsPerHost: 10,
		},
		PolicyEngine: engine,
		Metrics:      metrics.New(false),
		Logger:       zerolog.Nop(),
	})
	require.NoError(t, err)

	return httptest.NewServer(http.HandlerFunc(p.ServeHTTP))
}

func TestProxy_PassthroughNoPolicy(t *testing.T) {
	downstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("downstream-ok"))
	}))
	defer downstream.Close()

	proxySrv := newTestProxy(t, downstream.URL, nil)
	defer proxySrv.Close()

	resp, err := http.Get(proxySrv.URL + "/anything")
	require.NoError(t, err)
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "downstream-ok", string(body))
}

func TestProxy_LatencyPolicyAddsDelay(t *testing.T) {
	downstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer downstream.Close()

	pol := &models.Policy{
		Name:     "latency",
		Selector: models.Selector{},
		Latency:  &models.LatencyAction{FixedMs: 50},
	}
	proxySrv := newTestProxy(t, downstream.URL, pol)
	defer proxySrv.Close()

	start := time.Now()
	resp, err := http.Get(proxySrv.URL + "/x")
	elapsed := time.Since(start)
	require.NoError(t, err)
	resp.Body.Close()

	assert.GreaterOrEqual(t, elapsed, 50*time.Millisecond)
}

func TestProxy_ErrorPolicyShortCircuitsDownstream(t *testing.T) {
	var downstreamCalls int32
	downstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&downstreamCalls, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer downstream.Close()

	pol := &models.Policy{
		Name:     "error",
		Selector: models.Selector{},
		Error:    &models.ErrorAction{StatusCode: 503, Body: `{"error":"chaos"}`},
	}
	proxySrv := newTestProxy(t, downstream.URL, pol)
	defer proxySrv.Close()

	resp, err := http.Get(proxySrv.URL + "/x")
	require.NoError(t, err)
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
	assert.Equal(t, `{"error":"chaos"}`, string(body))
	assert.Equal(t, int32(0), atomic.LoadInt32(&downstreamCalls), "downstream must not be called on error policy")
}

func TestProxy_TimeoutPolicyAbortsSlowDownstream(t *testing.T) {
	downstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(1 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer downstream.Close()

	pol := &models.Policy{
		Name:     "timeout",
		Selector: models.Selector{},
		Timeout:  &models.TimeoutAction{TimeoutMs: 30},
	}
	proxySrv := newTestProxy(t, downstream.URL, pol)
	defer proxySrv.Close()

	start := time.Now()
	resp, err := http.Get(proxySrv.URL + "/x")
	elapsed := time.Since(start)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadGateway, resp.StatusCode, "context cancellation should surface as upstream error")
	assert.Less(t, elapsed, 500*time.Millisecond, "should abort well before downstream's own delay")
}

func TestProxy_DisconnectPolicyResetsConnection(t *testing.T) {
	downstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer downstream.Close()

	pol := &models.Policy{
		Name:       "disconnect",
		Selector:   models.Selector{},
		Disconnect: &models.DisconnectAction{},
	}
	proxySrv := newTestProxy(t, downstream.URL, pol)
	defer proxySrv.Close()

	_, err := http.Get(proxySrv.URL + "/x")
	assert.Error(t, err, "client must observe a connection error, not a valid response")
}

func TestProxy_TruncatePolicyCutsResponseBody(t *testing.T) {
	fullBody := "0123456789ABCDEFGHIJ" // 20 bytes
	downstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(fullBody))
	}))
	defer downstream.Close()

	pol := &models.Policy{
		Name:     "truncate",
		Selector: models.Selector{},
		Truncate: &models.TruncateAction{MaxBytes: 5},
	}
	proxySrv := newTestProxy(t, downstream.URL, pol)
	defer proxySrv.Close()

	resp, err := http.Get(proxySrv.URL + "/x")
	require.NoError(t, err)
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	assert.Equal(t, "01234", string(body))
}

func TestProxy_CorruptPolicyAltersResponseBody(t *testing.T) {
	fullBody := "the quick brown fox jumps over the lazy dog 1234567890"
	downstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(fullBody))
	}))
	defer downstream.Close()

	pol := &models.Policy{
		Name:     "corrupt",
		Selector: models.Selector{},
		Corrupt:  &models.CorruptAction{Probability: 1.0, ByteRange: [2]int{0, len(fullBody)}},
	}
	proxySrv := newTestProxy(t, downstream.URL, pol)
	defer proxySrv.Close()

	resp, err := http.Get(proxySrv.URL + "/x")
	require.NoError(t, err)
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	assert.Len(t, body, len(fullBody))
	assert.NotEqual(t, fullBody, string(body), "probability 1.0 across the whole range should alter the body")
}
