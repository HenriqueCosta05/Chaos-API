package admin

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/HenriqueCosta05/Chaos-API/internal/policy"
	"github.com/HenriqueCosta05/Chaos-API/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newTestAdmin wires an AdminServer to a real policy.Engine the same way
// main.go does, so CRUD-triggered reloads are observable on the engine.
func newTestAdmin(t *testing.T, apiKey string) (*httptest.Server, *policy.Engine) {
	t.Helper()

	engine := policy.NewEngine()
	var adminServer *AdminServer
	adminServer = NewAdminServer("config.yaml", func() error {
		engine.SetPolicies(adminServer.GetPolicies())
		return nil
	}, apiKey)

	srv := httptest.NewServer(adminServer.Router())
	t.Cleanup(srv.Close)
	return srv, engine
}

func doJSON(t *testing.T, method, url, apiKey string, body any) *http.Response {
	t.Helper()

	var reader *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		require.NoError(t, err)
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}

	req, err := http.NewRequest(method, url, reader)
	require.NoError(t, err)
	if apiKey != "" {
		req.Header.Set("X-API-Key", apiKey)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	return resp
}

func decodeBody(t *testing.T, resp *http.Response) map[string]any {
	t.Helper()
	defer resp.Body.Close()
	var out map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	return out
}

func TestAdminAPI_FullCRUDLifecycle(t *testing.T) {
	srv, engine := newTestAdmin(t, "")

	newPolicy := models.Policy{
		Name:     "api-timeout",
		Selector: models.Selector{PathRegex: "^/api/.*", Methods: []string{"POST"}, Probability: 50},
		Timeout:  &models.TimeoutAction{TimeoutMs: 100},
	}

	// Create
	resp := doJSON(t, http.MethodPost, srv.URL+"/policies", "", newPolicy)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	resp.Body.Close()
	assert.Len(t, engine.GetPolicies(), 1, "create must sync into the engine via reloadFn")

	// List
	resp = doJSON(t, http.MethodGet, srv.URL+"/policies", "", nil)
	body := decodeBody(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, float64(1), body["meta"].(map[string]any)["count"])

	// Get
	resp = doJSON(t, http.MethodGet, srv.URL+"/policies/api-timeout", "", nil)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	resp.Body.Close()

	// Update
	updated := newPolicy
	updated.Timeout = &models.TimeoutAction{TimeoutMs: 250}
	resp = doJSON(t, http.MethodPut, srv.URL+"/policies/api-timeout", "", updated)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	resp.Body.Close()
	require.Len(t, engine.GetPolicies(), 1)
	assert.Equal(t, 250, engine.GetPolicies()[0].Timeout.TimeoutMs)

	// Delete
	resp = doJSON(t, http.MethodDelete, srv.URL+"/policies/api-timeout", "", nil)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
	resp.Body.Close()
	assert.Len(t, engine.GetPolicies(), 0)

	// Get after delete
	resp = doJSON(t, http.MethodGet, srv.URL+"/policies/api-timeout", "", nil)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	resp.Body.Close()
}

func TestAdminAPI_CreateDuplicateNameConflicts(t *testing.T) {
	srv, _ := newTestAdmin(t, "")
	pol := models.Policy{Name: "dup", Selector: models.Selector{}, Disconnect: &models.DisconnectAction{}}

	resp := doJSON(t, http.MethodPost, srv.URL+"/policies", "", pol)
	resp.Body.Close()
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	resp = doJSON(t, http.MethodPost, srv.URL+"/policies", "", pol)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusConflict, resp.StatusCode)
}

func TestAdminAPI_CreateInvalidPolicyRejected(t *testing.T) {
	srv, _ := newTestAdmin(t, "")
	// No action configured -- Policy.Validate() requires exactly one.
	pol := models.Policy{Name: "invalid", Selector: models.Selector{}}

	resp := doJSON(t, http.MethodPost, srv.URL+"/policies", "", pol)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestAdminAPI_UpdateNameMismatchRejected(t *testing.T) {
	srv, _ := newTestAdmin(t, "")
	pol := models.Policy{Name: "a", Selector: models.Selector{}, Disconnect: &models.DisconnectAction{}}
	doJSON(t, http.MethodPost, srv.URL+"/policies", "", pol).Body.Close()

	mismatched := models.Policy{Name: "b", Selector: models.Selector{}, Disconnect: &models.DisconnectAction{}}
	resp := doJSON(t, http.MethodPut, srv.URL+"/policies/a", "", mismatched)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestAdminAPI_UpdateUnknownPolicyNotFound(t *testing.T) {
	srv, _ := newTestAdmin(t, "")
	pol := models.Policy{Name: "ghost", Selector: models.Selector{}, Disconnect: &models.DisconnectAction{}}

	resp := doJSON(t, http.MethodPut, srv.URL+"/policies/ghost", "", pol)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestAdminAPI_DeleteUnknownPolicyNotFound(t *testing.T) {
	srv, _ := newTestAdmin(t, "")
	resp := doJSON(t, http.MethodDelete, srv.URL+"/policies/ghost", "", nil)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestAdminAPI_ReloadEndpoint(t *testing.T) {
	srv, _ := newTestAdmin(t, "")
	resp := doJSON(t, http.MethodPost, srv.URL+"/reload", "", nil)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestAdminAPI_AuthRequiresAPIKeyWhenConfigured(t *testing.T) {
	srv, _ := newTestAdmin(t, "s3cr3t")

	resp := doJSON(t, http.MethodGet, srv.URL+"/policies", "", nil)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestAdminAPI_AuthAcceptsCorrectAPIKey(t *testing.T) {
	srv, _ := newTestAdmin(t, "s3cr3t")

	resp := doJSON(t, http.MethodGet, srv.URL+"/policies", "s3cr3t", nil)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestAdminAPI_AuthRejectsWrongAPIKey(t *testing.T) {
	srv, _ := newTestAdmin(t, "s3cr3t")

	resp := doJSON(t, http.MethodGet, srv.URL+"/policies", "wrong", nil)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}
