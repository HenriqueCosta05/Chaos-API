package proxy

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"testing"
	"time"

	"github.com/HenriqueCosta05/Chaos-API/internal/metrics"
	"github.com/HenriqueCosta05/Chaos-API/internal/policy"
	"github.com/HenriqueCosta05/Chaos-API/pkg/models"
	"github.com/rs/zerolog"
)

// newBenchProxy builds a passthrough Proxy (no policy) for benchmarking.
func newBenchProxy(b *testing.B, downstreamURL string) *httptest.Server {
	b.Helper()

	u, err := url.Parse(downstreamURL)
	if err != nil {
		b.Fatal(err)
	}

	p, err := NewProxy(&ProxyConfig{
		UpstreamURL: u,
		UpstreamConfig: &models.UpstreamConfig{
			Timeout:         2 * time.Second,
			MaxIdleConns:    100,
			MaxConnsPerHost: 100,
		},
		PolicyEngine: policy.NewEngine(),
		Metrics:      metrics.New(false),
		Logger:       zerolog.Nop(),
	})
	if err != nil {
		b.Fatal(err)
	}

	return httptest.NewServer(http.HandlerFunc(p.ServeHTTP))
}

// BenchmarkProxy_PassthroughOverhead measures the proxy's own added latency
// with no chaos policy active (PRD RK-01 guard metric: p99 overhead < 5ms).
// Run with: go test -bench=PassthroughOverhead -benchtime=2000x ./internal/proxy/...
func BenchmarkProxy_PassthroughOverhead(b *testing.B) {
	downstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer downstream.Close()

	proxySrv := newBenchProxy(b, downstream.URL)
	defer proxySrv.Close()

	client := &http.Client{}
	durations := make([]time.Duration, 0, b.N)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		start := time.Now()
		resp, err := client.Get(proxySrv.URL + "/bench")
		if err != nil {
			b.Fatal(err)
		}
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		durations = append(durations, time.Since(start))
	}
	b.StopTimer()

	reportPercentiles(b, durations)
}

func reportPercentiles(b *testing.B, durations []time.Duration) {
	b.Helper()
	if len(durations) == 0 {
		return
	}
	sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })

	pct := func(p float64) time.Duration {
		idx := int(p * float64(len(durations)))
		if idx >= len(durations) {
			idx = len(durations) - 1
		}
		return durations[idx]
	}

	b.ReportMetric(float64(pct(0.50).Microseconds()), "p50_us")
	b.ReportMetric(float64(pct(0.95).Microseconds()), "p95_us")
	b.ReportMetric(float64(pct(0.99).Microseconds()), "p99_us")
}
