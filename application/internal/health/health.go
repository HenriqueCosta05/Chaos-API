package health

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync/atomic"
	"time"
)

type HealthChecker struct {
	ready          atomic.Bool
	configHash     atomic.Value // string
	upstreamOK     atomic.Bool
	upstreamURL    string
	lastCheck      atomic.Value // time.Time
	checkInterval  time.Duration
	stopCh         chan struct{}
}

func NewHealthChecker(upstreamURL string, checkInterval time.Duration) *HealthChecker {
	hc := &HealthChecker{
		upstreamURL:   upstreamURL,
		checkInterval: checkInterval,
		stopCh:        make(chan struct{}),
	}
	hc.ready.Store(false)
	hc.upstreamOK.Store(false)
	return hc
}

func (h *HealthChecker) Start(ctx context.Context) {
	ticker := time.NewTicker(h.checkInterval)
	defer ticker.Stop()

	// Initial check
	h.checkUpstream()

	for {
		select {
		case <-ctx.Done():
			return
		case <-h.stopCh:
			return
		case <-ticker.C:
			h.checkUpstream()
		}
	}
}

func (h *HealthChecker) Stop() {
	close(h.stopCh)
}

func (h *HealthChecker) checkUpstream() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, h.upstreamURL+"/healthz", nil)
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Do(req)

	wasOK := h.upstreamOK.Load()
	nowOK := err == nil && resp != nil && resp.StatusCode < 500

	h.upstreamOK.Store(nowOK)
	h.lastCheck.Store(time.Now())

	if wasOK != nowOK {
		// Log state change
	}
}

func (h *HealthChecker) SetReady(ready bool) {
	h.ready.Store(ready)
}

func (h *HealthChecker) SetConfigHash(hash string) {
	h.configHash.Store(hash)
}

func (h *HealthChecker) IsReady() bool {
	return h.ready.Load() && h.upstreamOK.Load()
}

func (h *HealthChecker) IsAlive() bool {
	return true // liveness is always true if process is running
}

func (h *HealthChecker) HealthResponse() map[string]any {
	return map[string]any{
		"status":           "ok",
		"ready":            h.IsReady(),
		"config_hash":      h.configHash.Load(),
		"upstream_reachable": h.upstreamOK.Load(),
		"last_check":       h.lastCheck.Load(),
	}
}

func (h *HealthChecker) ReadyResponse() map[string]any {
	ready := h.IsReady()
	status := "ready"
	code := http.StatusOK
	if !ready {
		status = "not ready"
		code = http.StatusServiceUnavailable
	}
	return map[string]any{
		"status":              status,
		"config_hash":         h.configHash.Load(),
		"upstream_reachable":  h.upstreamOK.Load(),
		"last_check":          h.lastCheck.Load(),
		"_http_status":        code,
	}
}

// LivenessHandler handles /healthz endpoint
func (h *HealthChecker) LivenessHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, `{"status":"ok"}`)
}

// ReadinessHandler handles /readyz endpoint
func (h *HealthChecker) ReadinessHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	resp := h.ReadyResponse()
	statusCode := resp["_http_status"].(int)
	delete(resp, "_http_status")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(resp)
}