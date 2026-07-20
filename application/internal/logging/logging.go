package logging

import (
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// Config holds logging configuration
type Config struct {
	Level           string
	Format          string
	SampleRate      float64
	MaxBodyLogBytes int
}

// Setup configures global logger
func Setup(cfg Config) zerolog.Logger {
	var level zerolog.Level
	switch strings.ToLower(cfg.Level) {
	case "debug":
		level = zerolog.DebugLevel
	case "info":
		level = zerolog.InfoLevel
	case "warn":
		level = zerolog.WarnLevel
	case "error":
		level = zerolog.ErrorLevel
	default:
		level = zerolog.InfoLevel
	}

	zerolog.SetGlobalLevel(level)
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnixMs

	var output io.Writer = os.Stdout
	if strings.ToLower(cfg.Format) == "console" {
		output = zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: "15:04:05.000"}
	}

	logger := log.Output(output).With().
		Str("service", "chaosapi").
		Logger()

	// Sample rate for non-error logs; error/fatal levels always pass through
	if cfg.SampleRate > 0 && cfg.SampleRate < 1 {
		n := uint32(1 / cfg.SampleRate)
		logger = logger.Sample(&zerolog.LevelSampler{
			DebugSampler: &zerolog.BasicSampler{N: n},
			InfoSampler:  &zerolog.BasicSampler{N: n},
			WarnSampler:  &zerolog.BasicSampler{N: n},
		})
	}

	log.Logger = logger
	return logger
}

// SanitizeHeaders removes sensitive headers from map
func SanitizeHeaders(headers map[string]string) map[string]string {
	sensitive := map[string]bool{
		"authorization": true,
		"cookie":        true,
		"x-api-key":     true,
		"x-auth-token":  true,
		"proxy-authorization": true,
	}

	result := make(map[string]string, len(headers))
	for k, v := range headers {
		if sensitive[strings.ToLower(k)] {
			result[k] = "[REDACTED]"
		} else {
			result[k] = v
		}
	}
	return result
}

// TruncateBody truncates body for logging
func TruncateBody(body string, maxBytes int) string {
	if len(body) <= maxBytes {
		return body
	}
	return body[:maxBytes] + "... [truncated]"
}

// Middleware returns a chi middleware for request logging
func Middleware(logger zerolog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			next.ServeHTTP(w, r)
			logger.Info().
				Str("method", r.Method).
				Str("path", r.URL.Path).
				Dur("duration", time.Since(start)).
				Msg("request")
		})
	}
}