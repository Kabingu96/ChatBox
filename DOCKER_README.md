# ChatBox Docker Setup

This guide covers how to run the ChatBox application using Docker.

## Prerequisites

- Docker and Docker Compose installed
- Git (for cloning the repository)

## Quick Start (Development)

1. **Clone and navigate to the project:**
   ```bash
   git clone <your-repo-url>
   cd ChatBox
   ```

2. **Start the development environment:**
   ```bash
   docker-compose up -d
   ```

3. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8080
   - PostgreSQL: localhost:5432

## Production Deployment

1. **Copy and configure environment variables:**
   ```bash
   cp .env.production.example .env.production
   # Edit .env.production with your actual values
   ```

2. **Generate SSL certificates:**
   ```bash
   mkdir ssl
   # Add your SSL certificate files as cert.pem and key.pem
   ```

3. **Deploy with production compose:**
   ```bash
   docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
   ```

## Available Commands

### Development
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Rebuild and restart
docker-compose up --build -d

# Access database
docker-compose exec postgres psql -U chatbox -d chatbox
```

### Production
```bash
# Deploy production
docker-compose -f docker-compose.prod.yml up -d

# View production logs
docker-compose -f docker-compose.prod.yml logs -f

# Stop production
docker-compose -f docker-compose.prod.yml down
```

## Architecture

### Development Stack
- **Frontend**: React app served by development server
- **Backend**: Go application with hot reload
- **Database**: PostgreSQL 16
- **Networking**: Direct container communication

### Production Stack
- **Frontend**: React app built and served by Nginx
- **Backend**: Go application (optimized binary)
- **Database**: PostgreSQL 16 with persistent storage
- **Reverse Proxy**: Nginx with SSL termination, rate limiting
- **Networking**: Internal Docker network with external access via Nginx

## Security Features

- **SSL/TLS encryption** in production
- **Rate limiting** on API endpoints and WebSocket connections
- **Security headers** (HSTS, XSS protection, etc.)
- **Non-root containers** for enhanced security
- **Network isolation** between services

## Environment Variables

### Backend
- `PORT`: Server port (default: 8080)
- `DATABASE_URL`: PostgreSQL connection string

### Frontend
- `REACT_APP_BACKEND_URL`: Backend API URL

### Database
- `POSTGRES_DB`: Database name
- `POSTGRES_USER`: Database user
- `POSTGRES_PASSWORD`: Database password

## Troubleshooting

### Common Issues

1. **Port conflicts:**
   ```bash
   # Check what's using the ports
   netstat -tulpn | grep :8080
   netstat -tulpn | grep :3000
   netstat -tulpn | grep :5432
   ```

2. **Database connection issues:**
   ```bash
   # Check database health
   docker-compose exec postgres pg_isready -U chatbox -d chatbox
   
   # View database logs
   docker-compose logs postgres
   ```

3. **SSL certificate issues (production):**
   ```bash
   # Verify certificate files exist
   ls -la ssl/
   
   # Test certificate validity
   openssl x509 -in ssl/cert.pem -text -noout
   ```

### Logs and Debugging

```bash
# View all service logs
docker-compose logs

# View specific service logs
docker-compose logs backend
docker-compose logs frontend
docker-compose logs postgres

# Follow logs in real-time
docker-compose logs -f backend

# Access container shell
docker-compose exec backend sh
docker-compose exec postgres bash
```

## Performance Optimization

### Production Optimizations Applied
- Multi-stage Docker builds for smaller images
- Static binary compilation for Go backend
- Gzip compression for frontend assets
- Asset caching with proper headers
- Connection pooling for database
- Health checks for all services

### Monitoring
- Health check endpoints available at `/health`
- Container health status visible via `docker-compose ps`
- Logs aggregated through Docker logging drivers

## Scaling

For horizontal scaling in production:

```bash
# Scale backend instances
docker-compose -f docker-compose.prod.yml up -d --scale backend=3

# Note: Database and Nginx should remain single instances
# Use external load balancer for multiple Nginx instances
```