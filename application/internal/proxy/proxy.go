package proxy

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/HenriqueCosta05/Chaos-API/internal/logging"
	"github.com/HenriqueCosta05/Chaos-API/internal/metrics"
	"github.com/HenriqueCosta05/Chaos-API/internal/policy"
	"github.com/HenriqueCosta05/Chaos-API/pkg/models"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog"
)

// ProxyConfig holds proxy configuration
type ProxyConfig struct {
	UpstreamURL    *url.URL
	UpstreamConfig *models.UpstreamConfig
	PolicyEngine   *policy.Engine
	Metrics        *metrics.Metrics
	Logger         zerolog.Logger
}

type Proxy struct {
	upstreamURL     *url.URL
	transport       *http.Transport
	reverseProxy    *httputil.ReverseProxy
	policyEngine    *policy.Engine
	metrics         *metrics.Metrics
	logger          zerolog.Logger
	wsDialer        *websocket.Dialer
	upstreamConfig  *models.UpstreamConfig
	mu              sync.RWMutex
	currentPolicies []*models.Policy
}

func NewProxy(cfg *ProxyConfig) (*Proxy, error) {
	p := &Proxy{
		upstreamURL:    cfg.UpstreamURL,
		policyEngine:   cfg.PolicyEngine,
		metrics:        cfg.Metrics,
		logger:         cfg.Logger,
		upstreamConfig: cfg.UpstreamConfig,
	}

	// Configure transport
	p.transport = &http.Transport{
		MaxIdleConns:        cfg.UpstreamConfig.MaxIdleConns,
		MaxConnsPerHost:     cfg.UpstreamConfig.MaxConnsPerHost,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 10 * time.Second,
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: cfg.UpstreamConfig.TLSSkipVerify,
		},
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
	}

	// WebSocket dialer
	p.wsDialer = &websocket.Dialer{
		Proxy:            http.ProxyFromEnvironment,
		HandshakeTimeout: 10 * time.Second,
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: cfg.UpstreamConfig.TLSSkipVerify,
		},
	}

	// Create reverse proxy
	p.reverseProxy = &httputil.ReverseProxy{
		Director:       p.director,
		ModifyResponse: p.modifyResponse,
		ErrorHandler:   p.errorHandler,
		Transport:      p.transport,
	}

	return p, nil
}

func (p *Proxy) director(req *http.Request) {
	req.URL.Scheme = p.upstreamURL.Scheme
	req.URL.Host = p.upstreamURL.Host
	req.URL.Path = singleJoiningSlash(p.upstreamURL.Path, req.URL.Path)

	if _, ok := req.Header["User-Agent"]; !ok {
		req.Header.Set("User-Agent", "")
	}
}

func (p *Proxy) modifyResponse(resp *http.Response) error {
	// Response modification happens after policy application
	return nil
}

func (p *Proxy) errorHandler(w http.ResponseWriter, r *http.Request, err error) {
	p.logger.Error().
		Str("method", r.Method).
		Str("path", r.URL.Path).
		Err(err).
		Msg("upstream error")

	p.metrics.IncUpstreamError()

	w.WriteHeader(http.StatusBadGateway)
	w.Write([]byte(`{"error": "upstream unavailable"}`))
}

// ServeHTTP handles incoming requests
func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	requestID := getRequestID(r)

	log := p.logger.With().
		Str("request_id", requestID).
		Str("method", r.Method).
		Str("path", r.URL.Path).
		Logger()

	// Evaluate policies
	matchedPolicy := p.policyEngine.Evaluate(r)
	policyName := "passthrough"
	if matchedPolicy != nil {
		policyName = matchedPolicy.Name
	}

	// Apply latency first (before upstream call)
	if matchedPolicy != nil && matchedPolicy.Latency != nil {
		p.policyEngine.ApplyLatency(matchedPolicy)
		p.metrics.IncPolicyMatch(policyName, "latency")
	}

	// Apply error action (short-circuits upstream)
	if matchedPolicy != nil && matchedPolicy.Error != nil {
		p.policyEngine.ApplyError(w, matchedPolicy)
		p.metrics.IncPolicyMatch(policyName, "error")
		p.metrics.ObserveDuration(policyName, time.Since(start).Seconds())
		p.logRequest(log, r, matchedPolicy, time.Since(start), 0, http.StatusOK)
		return
	}

	// Handle timeout action
	var timeoutCh <-chan struct{}
	if matchedPolicy != nil && matchedPolicy.Timeout != nil {
		timeoutCh = p.policyEngine.ApplyTimeout(matchedPolicy)
		p.metrics.IncPolicyMatch(policyName, "timeout")
	}

	// Handle disconnect action
	if matchedPolicy != nil && matchedPolicy.Disconnect != nil {
		p.metrics.IncPolicyMatch(policyName, "disconnect")
		hijackDisconnect(w)
		p.logRequest(log, r, matchedPolicy, time.Since(start), 0, 0)
		return
	}

	// Handle WebSocket upgrade
	if websocket.IsWebSocketUpgrade(r) {
		p.handleWebSocket(w, r, matchedPolicy, start, policyName, requestID)
		return
	}

	// Apply truncate/corrupt wrappers
	var responseWriter http.ResponseWriter = w
	if matchedPolicy != nil {
		if matchedPolicy.Truncate != nil {
			responseWriter = p.policyEngine.ApplyTruncate(w, matchedPolicy)
			p.metrics.IncPolicyMatch(policyName, "truncate")
		}
		if matchedPolicy.Corrupt != nil {
			responseWriter = p.policyEngine.ApplyCorrupt(responseWriter, matchedPolicy)
			p.metrics.IncPolicyMatch(policyName, "corrupt")
		}
	}

	// Create response recorder for metrics
	rec := &responseRecorder{
		ResponseWriter: responseWriter,
		statusCode:     http.StatusOK,
	}

	// Proxy request with timeout context
	ctx := r.Context()
	if timeoutCh != nil {
		var cancel context.CancelFunc
		ctx, cancel = context.WithCancel(r.Context())
		defer cancel()

		go func() {
			select {
			case <-timeoutCh:
				cancel()
			case <-ctx.Done():
			}
		}()
	}

	req := r.WithContext(ctx)
	p.reverseProxy.ServeHTTP(rec, req)

	duration := time.Since(start)
	upstreamLatency := duration

	p.metrics.ObserveDuration(policyName, duration.Seconds())
	p.metrics.IncUpstreamRequest(statusClass(rec.statusCode))
	p.metrics.ObserveOverhead(0) // would need more precise measurement

	p.logRequest(log, r, matchedPolicy, duration, upstreamLatency, rec.statusCode)
}

func (p *Proxy) handleWebSocket(w http.ResponseWriter, r *http.Request, matchedPolicy *models.Policy, start time.Time, policyName, requestID string) {
	log := p.logger.With().
		Str("request_id", requestID).
		Str("method", r.Method).
		Str("path", r.URL.Path).
		Logger()

	// Upgrade client connection
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().Err(err).Msg("websocket upgrade failed")
		return
	}
	defer clientConn.Close()

	// Connect to upstream WebSocket
	upstreamURL := *p.upstreamURL
	upstreamURL.Scheme = map[bool]string{true: "wss", false: "ws"}[upstreamURL.Scheme == "https"]
	upstreamURL.Path = singleJoiningSlash(upstreamURL.Path, r.URL.Path)
	upstreamURL.RawQuery = r.URL.RawQuery

	upstreamConn, _, err := p.wsDialer.Dial(upstreamURL.String(), r.Header)
	if err != nil {
		log.Error().Err(err).Msg("upstream websocket dial failed")
		clientConn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "upstream unavailable"))
		return
	}
	defer upstreamConn.Close()

	// Copy messages bidirectionally
	errCh := make(chan error, 2)

	go func() {
		errCh <- copyWebSocket(clientConn, upstreamConn, matchedPolicy)
	}()

	go func() {
		errCh <- copyWebSocket(upstreamConn, clientConn, matchedPolicy)
	}()

	<-errCh // wait for one direction to close

	duration := time.Since(start)
	p.metrics.ObserveDuration(policyName, duration.Seconds())

	log.Info().
		Str("policy", policyName).
		Dur("duration", duration).
		Msg("websocket connection closed")
}

func copyWebSocket(dst, src *websocket.Conn, policy *models.Policy) error {
	for {
		msgType, msg, err := src.ReadMessage()
		if err != nil {
			return err
		}

		// Apply latency if configured
		if policy != nil && policy.Latency != nil {
			// In a real impl, apply latency per message
		}

		// Apply corrupt if configured
		if policy != nil && policy.Corrupt != nil {
			// Corrupt message bytes
		}

		if err := dst.WriteMessage(msgType, msg); err != nil {
			return err
		}
	}
}

func (p *Proxy) logRequest(log zerolog.Logger, r *http.Request, policy *models.Policy, duration, upstreamLatency time.Duration, statusCode int) {
	event := log.Info()
	if policy != nil {
		event = event.Str("policy_matched", policy.Name).Str("action", policy.ActionType())
	} else {
		event = event.Str("policy_matched", "none").Str("action", "passthrough")
	}
	event.
		Int64("latency_ms", duration.Milliseconds()).
		Int64("upstream_latency_ms", upstreamLatency.Milliseconds()).
		Int64("proxy_overhead_ms", (duration-upstreamLatency).Milliseconds()).
		Int("upstream_status", statusCode).
		Msg("request completed")

	// Headers are only ever logged at debug level, and always sanitized:
	// Authorization/Cookie/X-API-Key/etc. must never reach disk (RK-02).
	if debugEvent := log.Debug(); debugEvent.Enabled() {
		headers := make(map[string]string, len(r.Header))
		for k, v := range r.Header {
			if len(v) > 0 {
				headers[k] = v[0]
			}
		}
		debugEvent.Interface("headers", logging.SanitizeHeaders(headers)).Msg("request headers")
	}
}

// responseRecorder captures status code
type responseRecorder struct {
	http.ResponseWriter
	statusCode int
	written    int64
}

func (r *responseRecorder) WriteHeader(code int) {
	r.statusCode = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *responseRecorder) Write(b []byte) (int, error) {
	n, err := r.ResponseWriter.Write(b)
	r.written += int64(n)
	return n, err
}

func hijackDisconnect(w http.ResponseWriter) {
	hijacker, ok := w.(http.Hijacker)
	if !ok {
		return
	}
	conn, _, err := hijacker.Hijack()
	if err != nil {
		return
	}
	// Send RST by closing with linger
	if tcpConn, ok := conn.(*net.TCPConn); ok {
		tcpConn.SetLinger(0)
	}
	conn.Close()
}

func singleJoiningSlash(a, b string) string {
	aslash := strings.HasSuffix(a, "/")
	bslash := strings.HasPrefix(b, "/")
	switch {
	case aslash && bslash:
		return a + b[1:]
	case !aslash && !bslash:
		return a + "/" + b
	}
	return a + b
}

func getRequestID(r *http.Request) string {
	if id := r.Header.Get("X-Request-ID"); id != "" {
		return id
	}
	return "req-" + randomID()
}

func randomID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func statusClass(code int) string {
	switch {
	case code >= 200 && code < 300:
		return "2xx"
	case code >= 300 && code < 400:
		return "3xx"
	case code >= 400 && code < 500:
		return "4xx"
	case code >= 500:
		return "5xx"
	default:
		return "unknown"
	}
}
