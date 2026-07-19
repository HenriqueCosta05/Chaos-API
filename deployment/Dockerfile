# Build stage
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY application/ ./application/
COPY configs/ ./configs/

# Build binary
ARG VERSION=dev
ARG COMMIT=none
ARG DATE=unknown
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.date=$(DATE)" \
    -o /chaosapi ./application/cmd/chaosapi

# Final stage - distroless for minimal attack surface
FROM gcr.io/distroless/static:nonroot

COPY --from=builder /chaosapi /chaosapi
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY configs/chaosapi.yaml.example /etc/chaosapi/chaosapi.yaml

USER nonroot:nonroot

EXPOSE 8080 9090 8081

ENTRYPOINT ["/chaosapi"]
CMD ["-config", "/etc/chaosapi/chaosapi.yaml"]

# Metadata
LABEL org.opencontainers.image.title="ChaosAPI"
LABEL org.opencontainers.image.description="Controlled chaos injection proxy for HTTP services"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.revision="${COMMIT}"
LABEL org.opencontainers.image.created="${DATE}"
LABEL org.opencontainers.image.source="https://github.com/HenriqueCosta05/Chaos-API"
LABEL org.opencontainers.image.licenses="MIT"