# ChatBox - Real-time Chat Application

A secure, real-time chat application built with Go backend and React frontend.

## 🚀 Quick Start

### Option 1: Docker (Recommended)
```bash
# Development
cp .env.example .env
# Edit .env with your configuration
docker-compose up -d

# Production
cp .env.example .env.production
# Edit .env.production with production values
docker-compose -f docker-compose.prod.yml up -d
```

### Option 2: Manual Setup
```bash
# Backend
cd backend
go mod download
go run main.go

# Frontend (new terminal)
cd frontend
npm install
npm start
```

## 🌐 Deployment Options

### Best Option: Vercel + Railway/Render
**Easiest and most cost-effective for small to medium apps**

1. **Backend on Railway/Render:**
   - Connect your GitHub repo
   - Set environment variables:
     - `DATABASE_URL`: Your PostgreSQL connection string
     - `ALLOWED_ORIGINS`: Your frontend domain
   - Deploy from `/backend` directory

2. **Frontend on Vercel:**
   - Connect your GitHub repo
   - Set build settings: Root directory = `frontend`
   - Set environment variables:
     - `REACT_APP_API_BASE`: Your backend URL
     - `REACT_APP_WS_BASE`: Your backend WebSocket URL
   - Deploy

### Alternative: AWS/GCP/Azure
- Use container services (ECS, Cloud Run, Container Apps)
- Deploy using the provided Docker configurations

## 🔧 Configuration

### Environment Variables

**Backend (.env):**
```
PORT=8080
DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

**Frontend:**
```
REACT_APP_API_BASE=https://api.yourdomain.com
REACT_APP_WS_BASE=wss://api.yourdomain.com
```

## 🔒 Security Features

- ✅ SQL injection protection with parameterized queries
- ✅ CSRF protection with origin validation
- ✅ Secure WebSocket connections
- ✅ Password hashing with bcrypt
- ✅ Security headers (XSS, CSRF, etc.)
- ✅ Input validation and sanitization

## 📊 Database

PostgreSQL with automatic migrations. Tables:
- `users`: User accounts with hashed passwords
- `messages`: Chat messages with timestamps

## 🛠 Development

```bash
# Install dependencies
cd frontend && npm install
cd ../backend && go mod download

# Run tests
cd frontend && npm test
cd ../backend && go test ./...

# Build for production
docker-compose -f docker-compose.prod.yml build
```

## 📝 API Endpoints

- `POST /register` - User registration
- `POST /login` - User authentication
- `GET /get_dark_mode` - Get user theme preference
- `POST /set_dark_mode` - Set user theme preference
- `PUT /message` - Edit message
- `DELETE /message` - Delete message
- `GET /ws` - WebSocket connection

## 🚀 Deployment Recommendations

1. **Small Scale (< 1000 users)**: Vercel + Railway/Render
2. **Medium Scale (< 10k users)**: AWS ECS + RDS
3. **Large Scale (10k+ users)**: Kubernetes + managed database

## 📈 Scaling Considerations

- Add Redis for session management and WebSocket scaling
- Implement database connection pooling
- Use CDN for static assets
- Add rate limiting and monitoring

## 🔍 Monitoring

- Health checks available at `/health` (frontend) and root (backend)
- Structured logging for debugging
- WebSocket connection monitoring

## 📄 License

MIT License - see LICENSE file for details