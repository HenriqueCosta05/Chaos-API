package metrics

import (
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Metrics struct {
	RequestsTotal        *prometheus.CounterVec
	RequestDuration      *prometheus.HistogramVec
	ProxyOverhead        *prometheus.HistogramVec
	PolicyMatchesTotal   *prometheus.CounterVec
	UpstreamRequestsTotal *prometheus.CounterVec
	ConfigReloadsTotal   *prometheus.CounterVec
	UpstreamErrorsTotal  prometheus.Counter
}

func New(enabled bool) *Metrics {
	if !enabled {
		return &Metrics{} // nil-safe no-op metrics
	}

	m := &Metrics{
		RequestsTotal: promauto.NewCounterVec(prometheus.CounterOpts{
			Name: "chaosapi_requests_total",
			Help: "Total number of requests processed",
		}, []string{"policy", "result"}),

		RequestDuration: promauto.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "chaosapi_request_duration_seconds",
			Help:    "Request duration including proxy overhead and chaos policies",
			Buckets: prometheus.DefBuckets,
		}, []string{"policy"}),

		ProxyOverhead: promauto.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "chaosapi_proxy_overhead_seconds",
			Help:    "Proxy overhead without chaos policies",
			Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1},
		}, []string{}),

		PolicyMatchesTotal: promauto.NewCounterVec(prometheus.CounterOpts{
			Name: "chaosapi_policy_matches_total",
			Help: "Total number of policy matches by action type",
		}, []string{"policy", "action"}),

		UpstreamRequestsTotal: promauto.NewCounterVec(prometheus.CounterOpts{
			Name: "chaosapi_upstream_requests_total",
			Help: "Total requests to upstream by status class",
		}, []string{"status_class"}),

		ConfigReloadsTotal: promauto.NewCounterVec(prometheus.CounterOpts{
			Name: "chaosapi_config_reloads_total",
			Help: "Total config reload attempts",
		}, []string{"result"}),

		UpstreamErrorsTotal: promauto.NewCounter(prometheus.CounterOpts{
			Name: "chaosapi_upstream_errors_total",
			Help: "Total upstream errors",
		}),
	}

	return m
}

func (m *Metrics) IncRequest(policy, result string) {
	if m.RequestsTotal != nil {
		m.RequestsTotal.WithLabelValues(policy, result).Inc()
	}
}

func (m *Metrics) ObserveDuration(policy string, seconds float64) {
	if m.RequestDuration != nil {
		m.RequestDuration.WithLabelValues(policy).Observe(seconds)
	}
}

func (m *Metrics) ObserveOverhead(seconds float64) {
	if m.ProxyOverhead != nil {
		m.ProxyOverhead.WithLabelValues().Observe(seconds)
	}
}

func (m *Metrics) IncPolicyMatch(policy, action string) {
	if m.PolicyMatchesTotal != nil {
		m.PolicyMatchesTotal.WithLabelValues(policy, action).Inc()
	}
}

func (m *Metrics) IncUpstreamRequest(statusClass string) {
	if m.UpstreamRequestsTotal != nil {
		m.UpstreamRequestsTotal.WithLabelValues(statusClass).Inc()
	}
}

func (m *Metrics) IncConfigReload(result string) {
	if m.ConfigReloadsTotal != nil {
		m.ConfigReloadsTotal.WithLabelValues(result).Inc()
	}
}

func (m *Metrics) IncUpstreamError() {
	if m.UpstreamErrorsTotal != nil {
		m.UpstreamErrorsTotal.Inc()
	}
}

// Handler returns HTTP handler for /metrics endpoint
func (m *Metrics) Handler() http.Handler {
	return promhttp.Handler()
}

// Middleware returns a chi middleware for metrics
func Middleware(m *Metrics) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			next.ServeHTTP(w, r)
			if m != nil && m.RequestDuration != nil {
				m.RequestDuration.WithLabelValues("unknown").Observe(time.Since(start).Seconds())
			}
		})
	}
}