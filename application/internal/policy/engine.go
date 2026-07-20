package policy

import (
	"crypto/rand"
	"math/big"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/HenriqueCosta05/Chaos-API/pkg/models"
)

// Engine evaluates policies against requests
type Engine struct {
	mu       sync.RWMutex
	policies []*models.Policy
}

func NewEngine() *Engine {
	return &Engine{policies: make([]*models.Policy, 0)}
}

// SetPolicies atomically updates the policy list
func (e *Engine) SetPolicies(policies []models.Policy) {
	e.mu.Lock()
	defer e.mu.Unlock()

	e.policies = make([]*models.Policy, len(policies))
	for i := range policies {
		e.policies[i] = &policies[i]
	}
}

// GetPolicies returns a copy of current policies
func (e *Engine) GetPolicies() []*models.Policy {
	e.mu.RLock()
	defer e.mu.RUnlock()

	result := make([]*models.Policy, len(e.policies))
	copy(result, e.policies)
	return result
}

// Evaluate checks all policies and returns the first matching one
func (e *Engine) Evaluate(r *http.Request) *models.Policy {
	e.mu.RLock()
	defer e.mu.RUnlock()

	path := r.URL.Path
	headers := make(map[string]string)
	for k, v := range r.Header {
		if len(v) > 0 {
			headers[k] = v[0]
		}
	}
	queryParams := make(map[string]string)
	for k, v := range r.URL.Query() {
		if len(v) > 0 {
			queryParams[k] = v[0]
		}
	}

	for _, pol := range e.policies {
		if e.match(pol, r.Method, path, headers, queryParams) {
			return pol
		}
	}
	return nil
}

func (e *Engine) match(pol *models.Policy, method, path string, headers, queryParams map[string]string) bool {
	if !pol.Selector.MatchPath(path) {
		return false
	}
	if !pol.Selector.MatchHeaders(headers) {
		return false
	}
	if !pol.Selector.MatchQueryParams(queryParams) {
		return false
	}
	if !pol.Selector.MatchMethod(method) {
		return false
	}
	if !pol.Selector.MatchProbability() {
		return false
	}
	return true
}

// ApplyLatency applies latency action
func (e *Engine) ApplyLatency(pol *models.Policy) {
	if pol.Latency == nil {
		return
	}
	var delay time.Duration
	if pol.Latency.FixedMs > 0 {
		delay = time.Duration(pol.Latency.FixedMs) * time.Millisecond
	} else if pol.Latency.MinMs > 0 || pol.Latency.MaxMs > 0 {
		minMs := pol.Latency.MinMs
		maxMs := pol.Latency.MaxMs
		if minMs == 0 {
			minMs = 1
		}
		if maxMs == 0 {
			maxMs = minMs
		}
		if maxMs < minMs {
			maxMs = minMs
		}
		rangeMs := maxMs - minMs + 1
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(rangeMs)))
		delay = time.Duration(minMs+int(n.Int64())) * time.Millisecond
	}

	if delay > 0 {
		time.Sleep(delay)
	}
}

// ApplyError writes error response
func (e *Engine) ApplyError(w http.ResponseWriter, pol *models.Policy) {
	if pol.Error == nil {
		return
	}
	for k, v := range pol.Error.Headers {
		w.Header().Set(k, v)
	}
	if pol.Error.Body != "" {
		w.Header().Set("Content-Type", "application/json")
	}
	w.WriteHeader(pol.Error.StatusCode)
	w.Write([]byte(pol.Error.Body))
}

// ApplyTimeout returns a channel that closes after timeout
func (e *Engine) ApplyTimeout(pol *models.Policy) <-chan struct{} {
	if pol.Timeout == nil {
		ch := make(chan struct{})
		close(ch)
		return ch
	}
	ch := make(chan struct{})
	go func() {
		time.Sleep(time.Duration(pol.Timeout.TimeoutMs) * time.Millisecond)
		close(ch)
	}()
	return ch
}

// ApplyTruncate wraps ResponseWriter to truncate body
func (e *Engine) ApplyTruncate(w http.ResponseWriter, pol *models.Policy) http.ResponseWriter {
	if pol.Truncate == nil {
		return w
	}
	return &truncateWriter{
		ResponseWriter: w,
		maxBytes:       pol.Truncate.MaxBytes,
		written:        0,
	}
}

type truncateWriter struct {
	http.ResponseWriter
	maxBytes int
	written  int
}

// Write forwards up to maxBytes total to the underlying ResponseWriter and
// silently drops the rest, but always reports len(b) consumed (unless the
// underlying Write itself errors). io.Writer requires n == len(b) whenever
// err == nil; returning a short count here would make io.Copy (which
// httputil.ReverseProxy uses to stream the response body) treat it as
// io.ErrShortWrite and abort the copy, breaking the response mid-stream.
func (w *truncateWriter) Write(b []byte) (int, error) {
	remaining := w.maxBytes - w.written
	var toWrite []byte
	if remaining > 0 {
		toWrite = b
		if len(toWrite) > remaining {
			toWrite = toWrite[:remaining]
		}
	}

	if len(toWrite) > 0 {
		n, err := w.ResponseWriter.Write(toWrite)
		w.written += n
		if err != nil {
			return n, err
		}
	}
	return len(b), nil
}

// ApplyCorrupt wraps ResponseWriter to corrupt bytes
func (e *Engine) ApplyCorrupt(w http.ResponseWriter, pol *models.Policy) http.ResponseWriter {
	if pol.Corrupt == nil {
		return w
	}
	return &corruptWriter{
		ResponseWriter: w,
		probability:    pol.Corrupt.Probability,
		byteRange:      pol.Corrupt.ByteRange,
	}
}

type corruptWriter struct {
	http.ResponseWriter
	probability float64
	byteRange   [2]int
}

func (w *corruptWriter) Write(b []byte) (int, error) {
	corrupted := make([]byte, len(b))
	copy(corrupted, b)

	start := w.byteRange[0]
	end := w.byteRange[1]
	if end == 0 || end > len(corrupted) {
		end = len(corrupted)
	}
	if start < 0 {
		start = 0
	}
	if start >= end {
		start = 0
	}

	for i := start; i < end; i++ {
		n, _ := rand.Int(rand.Reader, big.NewInt(1000000))
		if float64(n.Int64())/1000000.0 < w.probability {
			// Corrupt this byte
			corrupted[i] = byte(n.Int64() % 256)
		}
	}

	return w.ResponseWriter.Write(corrupted)
}

// ActionType returns string for metrics
func ActionType(pol *models.Policy) string {
	if pol == nil {
		return "passthrough"
	}
	return pol.ActionType()
}

// ParseURL parses upstream URL
func ParseURL(rawURL string) (*url.URL, error) {
	return url.Parse(rawURL)
}
