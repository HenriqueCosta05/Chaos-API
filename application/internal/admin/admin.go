package admin

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/HenriqueCosta05/Chaos-API/pkg/models"
	"github.com/go-chi/chi/v5"
)

type AdminServer struct {
	mu         sync.RWMutex
	policies   map[string]*models.Policy
	configPath string
	reloadFn   func() error
	apiKey     string
}

func NewAdminServer(configPath string, reloadFn func() error, apiKey string) *AdminServer {
	return &AdminServer{
		policies:   make(map[string]*models.Policy),
		configPath: configPath,
		reloadFn:   reloadFn,
		apiKey:     apiKey,
	}
}

func (s *AdminServer) SetPolicies(policies []models.Policy) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.policies = make(map[string]*models.Policy, len(policies))
	for i := range policies {
		s.policies[policies[i].Name] = &policies[i]
	}
}

func (s *AdminServer) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(s.authMiddleware)

	r.Get("/policies", s.listPolicies)
	r.Post("/policies", s.createPolicy)
	r.Get("/policies/{name}", s.getPolicy)
	r.Put("/policies/{name}", s.updatePolicy)
	r.Delete("/policies/{name}", s.deletePolicy)
	r.Post("/reload", s.reloadConfig)

	return r
}

func (s *AdminServer) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.apiKey == "" {
			next.ServeHTTP(w, r)
			return
		}
		key := r.Header.Get("X-API-Key")
		if key == "" {
			key = r.URL.Query().Get("api_key")
		}
		if key != s.apiKey {
			http.Error(w, `{"error":{"code":"UNAUTHORIZED","message":"invalid API key"}}`, http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *AdminServer) listPolicies(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	policies := make([]*models.Policy, 0, len(s.policies))
	for _, p := range s.policies {
		policies = append(policies, p)
	}

	s.writeJSON(w, map[string]any{
		"data": policies,
		"meta": map[string]int{"count": len(policies)},
	})
}

func (s *AdminServer) createPolicy(w http.ResponseWriter, r *http.Request) {
	var policy models.Policy
	if err := json.NewDecoder(r.Body).Decode(&policy); err != nil {
		s.writeError(w, "VALIDATION_ERROR", "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := policy.Validate(); err != nil {
		s.writeError(w, "VALIDATION_ERROR", err.Error(), http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	if _, exists := s.policies[policy.Name]; exists {
		s.mu.Unlock()
		s.writeError(w, "CONFLICT", "policy with name "+policy.Name+" already exists", http.StatusConflict)
		return
	}
	s.policies[policy.Name] = &policy
	s.mu.Unlock()

	// Trigger reload
	if err := s.reloadFn(); err != nil {
		s.writeError(w, "INTERNAL_ERROR", "failed to reload config: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	s.writeJSON(w, map[string]any{
		"data": policy,
		"meta": map[string]string{"message": "policy created, config reloaded"},
	})
}

func (s *AdminServer) getPolicy(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	s.mu.RLock()
	policy, ok := s.policies[name]
	s.mu.RUnlock()

	if !ok {
		s.writeError(w, "NOT_FOUND", "policy not found: "+name, http.StatusNotFound)
		return
	}

	s.writeJSON(w, map[string]any{"data": policy})
}

func (s *AdminServer) updatePolicy(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	var policy models.Policy
	if err := json.NewDecoder(r.Body).Decode(&policy); err != nil {
		s.writeError(w, "VALIDATION_ERROR", "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if policy.Name != name {
		s.writeError(w, "VALIDATION_ERROR", "policy name in body must match URL", http.StatusBadRequest)
		return
	}

	if err := policy.Validate(); err != nil {
		s.writeError(w, "VALIDATION_ERROR", err.Error(), http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	if _, exists := s.policies[name]; !exists {
		s.mu.Unlock()
		s.writeError(w, "NOT_FOUND", "policy not found: "+name, http.StatusNotFound)
		return
	}
	s.policies[name] = &policy
	s.mu.Unlock()

	if err := s.reloadFn(); err != nil {
		s.writeError(w, "INTERNAL_ERROR", "failed to reload config: "+err.Error(), http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, map[string]any{
		"data": policy,
		"meta": map[string]string{"message": "policy updated, config reloaded"},
	})
}

func (s *AdminServer) deletePolicy(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	s.mu.Lock()
	if _, exists := s.policies[name]; !exists {
		s.mu.Unlock()
		s.writeError(w, "NOT_FOUND", "policy not found: "+name, http.StatusNotFound)
		return
	}
	delete(s.policies, name)
	s.mu.Unlock()

	if err := s.reloadFn(); err != nil {
		s.writeError(w, "INTERNAL_ERROR", "failed to reload config: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *AdminServer) reloadConfig(w http.ResponseWriter, r *http.Request) {
	if err := s.reloadFn(); err != nil {
		s.writeError(w, "INTERNAL_ERROR", "reload failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, map[string]any{"meta": map[string]string{"message": "config reloaded successfully"}})
}

func (s *AdminServer) writeJSON(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func (s *AdminServer) writeError(w http.ResponseWriter, code, message string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]string{
			"code":    code,
			"message": message,
		},
		"meta": map[string]string{},
	})
}

// GetPolicies returns current policies for config reload
func (s *AdminServer) GetPolicies() []models.Policy {
	s.mu.RLock()
	defer s.mu.RUnlock()

	policies := make([]models.Policy, 0, len(s.policies))
	for _, p := range s.policies {
		policies = append(policies, *p)
	}
	return policies
}
