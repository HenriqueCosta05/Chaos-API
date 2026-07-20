package policy

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/HenriqueCosta05/Chaos-API/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func mustSelector(t *testing.T, s models.Selector) models.Selector {
	t.Helper()
	require.NoError(t, s.Compile())
	return s
}

func TestSelector_MatchesPathRegex(t *testing.T) {
	s := mustSelector(t, models.Selector{PathRegex: "^/api/v1/payments"})

	assert.True(t, s.MatchPath("/api/v1/payments/123"))
	assert.False(t, s.MatchPath("/api/v1/notifications"))
}

func TestSelector_NoPathRegexMatchesEverything(t *testing.T) {
	s := mustSelector(t, models.Selector{})
	assert.True(t, s.MatchPath("/anything"))
}

func TestSelector_MatchesHeadersExact(t *testing.T) {
	s := mustSelector(t, models.Selector{Headers: map[string]string{"Content-Type": "application/json"}})

	assert.True(t, s.MatchHeaders(map[string]string{"Content-Type": "application/json"}))
	assert.False(t, s.MatchHeaders(map[string]string{"Content-Type": "text/plain"}))
	assert.False(t, s.MatchHeaders(map[string]string{}))
}

func TestSelector_MatchesHeadersRegex(t *testing.T) {
	s := mustSelector(t, models.Selector{Headers: map[string]string{"Accept": "regex:.*image/.*"}})

	assert.True(t, s.MatchHeaders(map[string]string{"Accept": "image/png"}))
	assert.False(t, s.MatchHeaders(map[string]string{"Accept": "text/html"}))
}

func TestSelector_MatchesQueryParams(t *testing.T) {
	s := mustSelector(t, models.Selector{QueryParams: map[string]string{"debug": "true"}})

	assert.True(t, s.MatchQueryParams(map[string]string{"debug": "true"}))
	assert.False(t, s.MatchQueryParams(map[string]string{"debug": "false"}))
	assert.False(t, s.MatchQueryParams(map[string]string{}))
}

func TestSelector_MatchesMethod(t *testing.T) {
	s := mustSelector(t, models.Selector{Methods: []string{"POST", "PUT"}})

	assert.True(t, s.MatchMethod("POST"))
	assert.False(t, s.MatchMethod("GET"))
}

func TestSelector_NoMethodsMatchesEverything(t *testing.T) {
	s := mustSelector(t, models.Selector{})
	assert.True(t, s.MatchMethod("DELETE"))
}

func TestSelector_MatchProbability_Boundaries(t *testing.T) {
	// Unset (Go zero value) means "no sampling filter configured": always
	// match, same as an empty PathRegex/Headers/QueryParams/Methods.
	unset := mustSelector(t, models.Selector{})
	for i := 0; i < 20; i++ {
		assert.True(t, unset.MatchProbability(), "unset probability must always sample")
	}

	full := mustSelector(t, models.Selector{Probability: 100})
	for i := 0; i < 20; i++ {
		assert.True(t, full.MatchProbability(), "probability 100 must always sample")
	}
}

func TestSelector_MatchProbability_MidRangeSamples(t *testing.T) {
	s := mustSelector(t, models.Selector{Probability: 50})

	sawTrue, sawFalse := false, false
	for i := 0; i < 200 && !(sawTrue && sawFalse); i++ {
		if s.MatchProbability() {
			sawTrue = true
		} else {
			sawFalse = true
		}
	}

	assert.True(t, sawTrue, "50%% probability should sample true at least once in 200 tries")
	assert.True(t, sawFalse, "50%% probability should sample false at least once in 200 tries")
}

func TestPolicyEngine_EvaluateReturnsFirstMatch(t *testing.T) {
	e := NewEngine()
	p1 := models.Policy{Name: "a", Selector: models.Selector{PathRegex: "^/api"}, Error: &models.ErrorAction{StatusCode: 500}}
	p2 := models.Policy{Name: "b", Selector: models.Selector{PathRegex: "^/api"}, Error: &models.ErrorAction{StatusCode: 500}}
	require.NoError(t, p1.Selector.Compile())
	require.NoError(t, p2.Selector.Compile())
	e.SetPolicies([]models.Policy{p1, p2})

	r := httptest.NewRequest(http.MethodGet, "/api/foo", nil)
	matched := e.Evaluate(r)

	require.NotNil(t, matched)
	assert.Equal(t, "a", matched.Name)
}

func TestPolicyEngine_EvaluateReturnsNilWhenNoMatch(t *testing.T) {
	e := NewEngine()
	p := models.Policy{Name: "only", Selector: models.Selector{PathRegex: "^/only"}, Error: &models.ErrorAction{StatusCode: 500}}
	require.NoError(t, p.Selector.Compile())
	e.SetPolicies([]models.Policy{p})

	r := httptest.NewRequest(http.MethodGet, "/other", nil)
	assert.Nil(t, e.Evaluate(r))
}

func TestPolicyEngine_SetPoliciesAtomicSwap(t *testing.T) {
	e := NewEngine()
	p1 := models.Policy{Name: "first", Selector: models.Selector{}, Error: &models.ErrorAction{StatusCode: 500}}
	require.NoError(t, p1.Selector.Compile())
	e.SetPolicies([]models.Policy{p1})
	assert.Len(t, e.GetPolicies(), 1)

	e.SetPolicies([]models.Policy{})
	assert.Len(t, e.GetPolicies(), 0)
}

func TestApplyLatency_FixedMs(t *testing.T) {
	e := NewEngine()
	pol := &models.Policy{Latency: &models.LatencyAction{FixedMs: 20}}

	start := time.Now()
	e.ApplyLatency(pol)
	elapsed := time.Since(start)

	assert.GreaterOrEqual(t, elapsed, 20*time.Millisecond)
}

func TestApplyLatency_Range(t *testing.T) {
	e := NewEngine()
	pol := &models.Policy{Latency: &models.LatencyAction{MinMs: 10, MaxMs: 20}}

	start := time.Now()
	e.ApplyLatency(pol)
	elapsed := time.Since(start)

	assert.GreaterOrEqual(t, elapsed, 10*time.Millisecond)
}

func TestApplyLatency_NilActionNoOp(t *testing.T) {
	e := NewEngine()
	start := time.Now()
	e.ApplyLatency(&models.Policy{})
	assert.Less(t, time.Since(start), 5*time.Millisecond)
}

func TestApplyError_WritesStatusBodyAndHeaders(t *testing.T) {
	e := NewEngine()
	pol := &models.Policy{Error: &models.ErrorAction{
		StatusCode: 503,
		Body:       `{"error":"unavailable"}`,
		Headers:    map[string]string{"Retry-After": "30"},
	}}

	rec := httptest.NewRecorder()
	e.ApplyError(rec, pol)

	assert.Equal(t, 503, rec.Code)
	assert.Equal(t, `{"error":"unavailable"}`, rec.Body.String())
	assert.Equal(t, "30", rec.Header().Get("Retry-After"))
}

func TestApplyTimeout_ChannelClosesAfterDuration(t *testing.T) {
	e := NewEngine()
	pol := &models.Policy{Timeout: &models.TimeoutAction{TimeoutMs: 20}}

	ch := e.ApplyTimeout(pol)
	select {
	case <-ch:
		t.Fatal("channel closed before timeout elapsed")
	case <-time.After(5 * time.Millisecond):
	}

	select {
	case <-ch:
	case <-time.After(100 * time.Millisecond):
		t.Fatal("channel did not close after timeout elapsed")
	}
}

func TestApplyTimeout_NilActionClosesImmediately(t *testing.T) {
	e := NewEngine()
	ch := e.ApplyTimeout(&models.Policy{})
	select {
	case <-ch:
	default:
		t.Fatal("expected already-closed channel for nil timeout action")
	}
}

func TestApplyTruncate_CutsBodyAtMaxBytes(t *testing.T) {
	e := NewEngine()
	pol := &models.Policy{Truncate: &models.TruncateAction{MaxBytes: 5}}

	rec := httptest.NewRecorder()
	w := e.ApplyTruncate(rec, pol)

	input := []byte("hello world")
	n, err := w.Write(input)
	require.NoError(t, err)
	// io.Writer requires n == len(input) when err == nil, even though only
	// the first 5 bytes actually reached the underlying writer -- otherwise
	// io.Copy (used by httputil.ReverseProxy to stream the body) treats the
	// short count as io.ErrShortWrite and aborts the response mid-stream.
	assert.Equal(t, len(input), n)
	assert.Equal(t, "hello", rec.Body.String())
}

func TestApplyTruncate_DropsWritesAfterLimit(t *testing.T) {
	e := NewEngine()
	pol := &models.Policy{Truncate: &models.TruncateAction{MaxBytes: 5}}

	rec := httptest.NewRecorder()
	w := e.ApplyTruncate(rec, pol)

	_, _ = w.Write([]byte("hello"))
	tail := []byte(" world")
	n, err := w.Write(tail)
	require.NoError(t, err)
	assert.Equal(t, len(tail), n, "must report full consumption to satisfy io.Writer contract")
	assert.Equal(t, "hello", rec.Body.String(), "but the underlying writer must not receive the dropped tail")
}

func TestApplyCorrupt_ZeroProbabilityLeavesBodyUnchanged(t *testing.T) {
	e := NewEngine()
	pol := &models.Policy{Corrupt: &models.CorruptAction{Probability: 0.000001}}

	rec := httptest.NewRecorder()
	w := e.ApplyCorrupt(rec, pol)

	original := []byte("hello world this is a test payload")
	_, err := w.Write(original)
	require.NoError(t, err)
	// With near-zero probability, corruption is extremely unlikely across a short payload.
	assert.Equal(t, len(original), rec.Body.Len())
}

func TestApplyCorrupt_RespectsByteRange(t *testing.T) {
	e := NewEngine()
	pol := &models.Policy{Corrupt: &models.CorruptAction{Probability: 1.0, ByteRange: [2]int{2, 4}}}

	rec := httptest.NewRecorder()
	w := e.ApplyCorrupt(rec, pol)

	original := []byte("AAAAAAAAAA")
	_, err := w.Write(original)
	require.NoError(t, err)

	out := rec.Body.Bytes()
	require.Len(t, out, len(original))
	// Bytes outside [2,4) must be untouched.
	assert.Equal(t, byte('A'), out[0])
	assert.Equal(t, byte('A'), out[1])
	assert.Equal(t, byte('A'), out[5])
	assert.Equal(t, byte('A'), out[9])
}

func TestParseURL(t *testing.T) {
	u, err := ParseURL("https://api.example.com/v1")
	require.NoError(t, err)
	assert.Equal(t, "api.example.com", u.Host)
}

func TestParseURL_Invalid(t *testing.T) {
	_, err := ParseURL("://not-a-url")
	assert.Error(t, err)
}
