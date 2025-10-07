# syntax=docker/dockerfile:1

# Build stage
FROM golang:1.24 as builder
WORKDIR /app

# Cache deps
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# Copy source
COPY . .

# Build
RUN --mount=type=cache,target=/go/pkg/mod \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /server

# Runtime stage
FROM gcr.io/distroless/base-debian12
WORKDIR /app
COPY --from=builder /server /app/server
# include migrations for runtime execution
COPY --from=builder /app/migrations /app/migrations

EXPOSE 8080
ENV PORT=8080
USER nonroot:nonroot

ENTRYPOINT ["/app/server"]
