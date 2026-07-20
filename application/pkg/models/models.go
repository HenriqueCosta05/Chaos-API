package models

import (
	"crypto/rand"
	"math/big"
	"regexp"
	"time"
)

// Policy represents a chaos policy configuration
type Policy struct {
	Name     string   `yaml:"name" json:"name" validate:"required,slug"`
	Selector Selector `yaml:"selector" json:"selector" validate:"required"`
	// Exactly one action must be set
	Latency    *LatencyAction    `yaml:"latency,omitempty" json:"latency,omitempty"`
	Error      *ErrorAction      `yaml:"error,omitempty" json:"error,omitempty"`
	Timeout    *TimeoutAction    `yaml:"timeout,omitempty" json:"timeout,omitempty"`
	Disconnect *DisconnectAction `yaml:"disconnect,omitempty" json:"disconnect,omitempty"`
	Truncate   *TruncateAction   `yaml:"truncate,omitempty" json:"truncate,omitempty"`
	Corrupt    *CorruptAction    `yaml:"corrupt,omitempty" json:"corrupt,omitempty"`
	Metadata   map[string]string `yaml:"metadata,omitempty" json:"metadata,omitempty"`
}

// Selector defines rules for matching requests
type Selector struct {
	PathRegex    string            `yaml:"path_regex,omitempty" json:"path_regex,omitempty"`
	Headers      map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
	QueryParams  map[string]string `yaml:"query_params,omitempty" json:"query_params,omitempty"`
	Methods      []string          `yaml:"methods,omitempty" json:"methods,omitempty"`
	Probability  int               `yaml:"probability,omitempty" json:"probability,omitempty"` // 0-100
	compiledPath *regexp.Regexp    `yaml:"-" json:"-"`
}

// Compile compiles the regex patterns for efficient matching
func (s *Selector) Compile() error {
	if s.PathRegex != "" {
		re, err := regexp.Compile(s.PathRegex)
		if err != nil {
			return err
		}
		s.compiledPath = re
	}
	return nil
}

// MatchPath checks if the path matches the selector's path regex
func (s *Selector) MatchPath(path string) bool {
	if s.compiledPath == nil {
		return true // no path regex = match all
	}
	return s.compiledPath.MatchString(path)
}

// MatchHeaders checks if headers match (exact or regex with "regex:" prefix)
func (s *Selector) MatchHeaders(headers map[string]string) bool {
	if len(s.Headers) == 0 {
		return true
	}
	for key, expected := range s.Headers {
		actual, ok := headers[key]
		if !ok {
			return false
		}
		// Support "regex:pattern" prefix
		if len(expected) > 6 && expected[:6] == "regex:" {
			re, err := regexp.Compile(expected[6:])
			if err != nil {
				return false
			}
			if !re.MatchString(actual) {
				return false
			}
		} else if actual != expected {
			return false
		}
	}
	return true
}

// MatchQueryParams checks if query params match
func (s *Selector) MatchQueryParams(params map[string]string) bool {
	if len(s.QueryParams) == 0 {
		return true
	}
	for key, expected := range s.QueryParams {
		actual, ok := params[key]
		if !ok || actual != expected {
			return false
		}
	}
	return true
}

// MatchMethod checks if HTTP method matches
func (s *Selector) MatchMethod(method string) bool {
	if len(s.Methods) == 0 {
		return true
	}
	for _, m := range s.Methods {
		if m == method {
			return true
		}
	}
	return false
}

// MatchProbability returns true if request should be sampled based on probability.
// Probability <= 0 (including the Go zero value on an omitted field) means no
// sampling filter was configured, so it always matches -- consistent with every
// other selector field (path, headers, query, method), which default to "match
// all" when left empty rather than "match nothing".
func (s *Selector) MatchProbability() bool {
	if s.Probability <= 0 {
		return true
	}
	if s.Probability >= 100 {
		return true
	}
	threshold, err := rand.Int(rand.Reader, big.NewInt(100))
	if err != nil {
		return false
	}
	return int(threshold.Int64()) < s.Probability
}

// LatencyAction adds latency to requests
type LatencyAction struct {
	FixedMs int  `yaml:"fixed_ms,omitempty" json:"fixed_ms,omitempty"`
	MinMs   int  `yaml:"min_ms,omitempty" json:"min_ms,omitempty"`
	MaxMs   int  `yaml:"max_ms,omitempty" json:"max_ms,omitempty"`
	Jitter  bool `yaml:"jitter,omitempty" json:"jitter,omitempty"`
}

// ErrorAction returns an error response without calling downstream
type ErrorAction struct {
	StatusCode int               `yaml:"status_code" json:"status_code" validate:"required,gte=400,lte=599"`
	Body       string            `yaml:"body,omitempty" json:"body,omitempty"`
	Headers    map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
}

// TimeoutAction closes connection after timeout without responding
type TimeoutAction struct {
	TimeoutMs int `yaml:"timeout_ms" json:"timeout_ms" validate:"required,gt=0"`
}

// DisconnectAction closes TCP connection immediately (RST)
type DisconnectAction struct{}

// TruncateAction truncates response body to max bytes
type TruncateAction struct {
	MaxBytes int `yaml:"max_bytes" json:"max_bytes" validate:"required,gt=0"`
}

// CorruptAction corrupts random bytes in request/response
type CorruptAction struct {
	Probability float64 `yaml:"probability" json:"probability" validate:"required,gt=0,lte=1"`
	ByteRange   [2]int  `yaml:"byte_range,omitempty" json:"byte_range,omitempty"` // [start, end]
}

// ActionType returns the type of action this policy performs
func (p *Policy) ActionType() string {
	switch {
	case p.Latency != nil:
		return "latency"
	case p.Error != nil:
		return "error"
	case p.Timeout != nil:
		return "timeout"
	case p.Disconnect != nil:
		return "disconnect"
	case p.Truncate != nil:
		return "truncate"
	case p.Corrupt != nil:
		return "corrupt"
	default:
		return "none"
	}
}

// Validate checks that exactly one action is configured
func (p *Policy) Validate() error {
	actions := 0
	if p.Latency != nil {
		actions++
	}
	if p.Error != nil {
		actions++
	}
	if p.Timeout != nil {
		actions++
	}
	if p.Disconnect != nil {
		actions++
	}
	if p.Truncate != nil {
		actions++
	}
	if p.Corrupt != nil {
		actions++
	}
	if actions != 1 {
		return ErrInvalidPolicyActions
	}
	return p.Selector.Compile()
}

// Config represents the full application configuration
type Config struct {
	Server    ServerConfig    `yaml:"server" json:"server"`
	Upstream  UpstreamConfig  `yaml:"upstream" json:"upstream"`
	Policies  []Policy        `yaml:"policies" json:"policies"`
	Metrics   MetricsConfig   `yaml:"metrics" json:"metrics"`
	Logging   LoggingConfig   `yaml:"logging" json:"logging"`
	AdminAPI  AdminAPIConfig  `yaml:"admin_api" json:"admin_api"`
	HotReload HotReloadConfig `yaml:"hot_reload" json:"hot_reload"`
}

type ServerConfig struct {
	Port         int           `yaml:"port" json:"port" validate:"required,gt=0,lte=65535"`
	ReadTimeout  time.Duration `yaml:"read_timeout" json:"read_timeout"`
	WriteTimeout time.Duration `yaml:"write_timeout" json:"write_timeout"`
	IdleTimeout  time.Duration `yaml:"idle_timeout" json:"idle_timeout"`
}

type UpstreamConfig struct {
	URL             string        `yaml:"url" json:"url" validate:"required,url"`
	Timeout         time.Duration `yaml:"timeout" json:"timeout"`
	TLSSkipVerify   bool          `yaml:"tls_skip_verify" json:"tls_skip_verify"`
	MaxIdleConns    int           `yaml:"max_idle_conns" json:"max_idle_conns"`
	MaxConnsPerHost int           `yaml:"max_conns_per_host" json:"max_conns_per_host"`
}

type MetricsConfig struct {
	Enabled bool   `yaml:"enabled" json:"enabled"`
	Port    int    `yaml:"port" json:"port" validate:"gt=0,lte=65535"`
	Path    string `yaml:"path" json:"path"`
}

type LoggingConfig struct {
	Level           string  `yaml:"level" json:"level" validate:"oneof=debug info warn error"`
	Format          string  `yaml:"format" json:"format" validate:"oneof=json console"`
	SampleRate      float64 `yaml:"sample_rate" json:"sample_rate" validate:"gte=0,lte=1"`
	MaxBodyLogBytes int     `yaml:"max_body_log_bytes" json:"max_body_log_bytes"`
}

type AdminAPIConfig struct {
	Enabled bool   `yaml:"enabled" json:"enabled"`
	Port    int    `yaml:"port" json:"port" validate:"gt=0,lte=65535"`
	APIKey  string `yaml:"api_key" json:"-"` // never serialize
	MTLS    bool   `yaml:"mtls" json:"mtls"`
}

type HotReloadConfig struct {
	Enabled    bool          `yaml:"enabled" json:"enabled"`
	Signal     string        `yaml:"signal" json:"signal" validate:"oneof=SIGHUP SIGUSR1"`
	DebounceMs int           `yaml:"debounce_ms" json:"debounce_ms"`
	Debounce   time.Duration `yaml:"-" json:"-"`
}

var ErrInvalidPolicyActions = &ValidationError{Field: "policy", Message: "exactly one action (latency, error, timeout, disconnect, truncate, corrupt) must be configured"}

type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	return e.Field + ": " + e.Message
}
