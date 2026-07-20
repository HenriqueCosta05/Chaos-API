package logging

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSanitizeHeaders_RedactsSensitiveKeys(t *testing.T) {
	input := map[string]string{
		"Authorization":       "Bearer secret-token",
		"Cookie":              "session=abc123",
		"X-Api-Key":           "sk-live-xxx",
		"X-Auth-Token":        "tok-xxx",
		"Proxy-Authorization": "Basic xxx",
		"Content-Type":        "application/json",
		"X-Request-ID":        "req-1",
	}

	result := SanitizeHeaders(input)

	assert.Equal(t, "[REDACTED]", result["Authorization"])
	assert.Equal(t, "[REDACTED]", result["Cookie"])
	assert.Equal(t, "[REDACTED]", result["X-Api-Key"])
	assert.Equal(t, "[REDACTED]", result["X-Auth-Token"])
	assert.Equal(t, "[REDACTED]", result["Proxy-Authorization"])
	assert.Equal(t, "application/json", result["Content-Type"])
	assert.Equal(t, "req-1", result["X-Request-ID"])
}

func TestSanitizeHeaders_CaseInsensitive(t *testing.T) {
	input := map[string]string{"authORIZATION": "Bearer secret"}
	result := SanitizeHeaders(input)
	assert.Equal(t, "[REDACTED]", result["authORIZATION"])
}

func TestSanitizeHeaders_EmptyMap(t *testing.T) {
	result := SanitizeHeaders(map[string]string{})
	assert.Empty(t, result)
}

func TestTruncateBody_ShorterThanLimit(t *testing.T) {
	assert.Equal(t, "hello", TruncateBody("hello", 10))
}

func TestTruncateBody_ExactlyAtLimit(t *testing.T) {
	assert.Equal(t, "hello", TruncateBody("hello", 5))
}

func TestTruncateBody_LongerThanLimit(t *testing.T) {
	assert.Equal(t, "hel... [truncated]", TruncateBody("hello world", 3))
}
