# ChaosAPI Makefile

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT  ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "none")
DATE    ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
BINARY  = chaosapi
BUILD_DIR = ./bin

# Go build flags
LDFLAGS = -s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.date=$(DATE)
GOFLAGS = -ldflags="$(LDFLAGS)"

.PHONY: all build build-all test cover bench lint fmt vet tools dev run docker docker-multi docker-push compose-up compose-down release clean tidy update help

all: lint test build

## Build the binary
build:
	@mkdir -p $(BUILD_DIR)
	go build $(GOFLAGS) -o $(BUILD_DIR)/$(BINARY) ./cmd/chaosapi

## Build for multiple platforms
build-all:
	@mkdir -p $(BUILD_DIR)
	GOOS=linux GOARCH=amd64 go build $(GOFLAGS) -o $(BUILD_DIR)/$(BINARY)-linux-amd64 ./cmd/chaosapi
	GOOS=linux GOARCH=arm64 go build $(GOFLAGS) -o $(BUILD_DIR)/$(BINARY)-linux-arm64 ./cmd/chaosapi
	GOOS=darwin GOARCH=amd64 go build $(GOFLAGS) -o $(BUILD_DIR)/$(BINARY)-darwin-amd64 ./cmd/chaosapi
	GOOS=darwin GOARCH=arm64 go build $(GOFLAGS) -o $(BUILD_DIR)/$(BINARY)-darwin-arm64 ./cmd/chaosapi
	GOOS=windows GOARCH=amd64 go build $(GOFLAGS) -o $(BUILD_DIR)/$(BINARY)-windows-amd64.exe ./cmd/chaosapi

## Run tests
test:
	go test -v -race -count=1 ./...

## Run tests with coverage
cover:
	go test -race -coverprofile=coverage.out -covermode=atomic ./...
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

## Run benchmarks (proxy overhead, RK-01 guard metric: p99 < 5ms)
bench:
	go test -bench=. -benchmem -run ^$$ ./internal/proxy/...

## Run linters
lint:
	golangci-lint run ./...

## Format code
fmt:
	go fmt ./...
	goimports -w ./...

## Run go vet
vet:
	go vet ./...

## Install dev tools
tools:
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	go install golang.org/x/tools/cmd/goimports@latest
	go install github.com/air-verse/air@latest
	go install github.com/goreleaser/goreleaser@latest

## Run with hot reload (dev)
dev:
	air -c .air.toml

## Run with config
run: build
	$(BUILD_DIR)/$(BINARY) -config configs/chaosapi.yaml

## Build Docker image
docker:
	docker build -t ghcr.io/henriquecosta05/chaos-api:$(VERSION) -t ghcr.io/henriquecosta05/chaos-api:latest -f deployment/Dockerfile .

## Build multi-arch Docker image
docker-multi:
	docker buildx build --platform linux/amd64,linux/arm64 \
		-t ghcr.io/henriquecosta05/chaos-api:$(VERSION) \
		-t ghcr.io/henriquecosta05/chaos-api:latest \
		-f deployment/Dockerfile . --push

## Push Docker image
docker-push:
	docker push ghcr.io/henriquecosta05/chaos-api:$(VERSION)
	docker push ghcr.io/henriquecosta05/chaos-api:latest

## Run with docker-compose
compose-up:
	docker-compose -f deployment/docker-compose.yml up -d

## Stop docker-compose
compose-down:
	docker-compose -f deployment/docker-compose.yml down

## Generate release
release:
	goreleaser release --clean --snapshot

## Clean build artifacts
clean:
	rm -rf $(BUILD_DIR) coverage.out coverage.html tmp

## Tidy dependencies
tidy:
	go mod tidy
	go mod verify

## Update dependencies
update:
	go get -u ./...
	go mod tidy

## Show help
help:
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Default target
.DEFAULT_GOAL := help