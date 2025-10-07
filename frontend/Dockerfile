# syntax=docker/dockerfile:1

# Build stage
FROM node:18-alpine AS builder

WORKDIR /build

# Accept build arguments
ARG REACT_APP_API_BASE
ARG REACT_APP_WS_BASE

# Set environment variables
ENV REACT_APP_API_BASE=$REACT_APP_API_BASE
ENV REACT_APP_WS_BASE=$REACT_APP_WS_BASE

# Copy package files
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Runtime stage
FROM nginx:alpine

# Copy built app
COPY --from=builder /build/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Add non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]