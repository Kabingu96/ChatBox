# syntax=docker/dockerfile:1

# Build stage
FROM golang:1.24-alpine AS builder

# Install git for go mod download
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /build

# Copy go mod files
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download && go mod verify

# Copy source code
COPY . .

# Build with optimizations
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags='-w -s -extldflags "-static"' \
    -a -installsuffix cgo -o server .

# Runtime stage
FROM scratch

# Copy CA certificates and timezone data
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Copy binary and migrations
COPY --from=builder /build/server /server
COPY --from=builder /build/migrations /migrations

# Create non-root user
USER 65534:65534

EXPOSE 8080
ENV PORT=8080

ENTRYPOINT ["/server"]
