## Deploying the Chat App (Vercel + Fly.io + Postgres)

This repo is configured for Option A: frontend on Vercel, backend on Fly.io, Postgres for persistence.

### Overview
- Frontend (React/CRA) in `frontend/` deploys to Vercel as a static build.
- Backend (Go + Gorilla WebSocket) in `backend/` deploys to Fly.io from `backend/Dockerfile`.
- Postgres either via Fly Postgres (same region recommended) or Neon. Set `DATABASE_URL` on Fly.

### 1) Backend: Fly.io
1. Install Fly CLI and login.
2. From repo root:
   - `cd backend`
   - `fly apps create chatbox-backend` (or your app name)
   - `fly launch --no-deploy` (it will pick up `fly.toml` and `Dockerfile`)
3. Provision Postgres:
   - Fly Postgres: `fly postgres create` (pick same region as app), then `fly postgres attach` to the app to inject `DATABASE_URL`.
   - Or use Neon: create DB, copy connection string, and set it:
     - `fly secrets set DATABASE_URL="postgres://user:pass@host/db?sslmode=require"`
4. Deploy backend: `fly deploy`.
5. Add a custom domain (optional but recommended):
   - `fly domains create api.yourdomain.com`
   - Complete DNS instructions shown by Fly.
   - After DNS propagates, your backend is available at `https://api.yourdomain.com` and WebSocket at `wss://api.yourdomain.com/ws`.

Notes:
- The backend uses `PORT` (defaults to 8080) and reads `DATABASE_URL`. If not set, it falls back to in-memory mode.
- SQL migrations in `backend/migrations` run automatically at start.

### 2) Frontend: Vercel
1. Push this repo to GitHub/GitLab/Bitbucket.
2. Import the project in Vercel and set Root Directory to the repo root.
3. Vercel will detect `vercel.json` and build `frontend` using CRA.
4. Set the following Project Environment Variables in Vercel:
   - `REACT_APP_API_BASE=https://api.yourdomain.com`
   - `REACT_APP_WS_BASE=wss://api.yourdomain.com`
5. Redeploy. Your frontend will call the Fly backend over HTTPS/WebSocket Secure.

### 3) DNS
- `app.yourdomain.com` -> Vercel (set in Vercel Project -> Domains)
- `api.yourdomain.com` -> Fly.io (set in Fly domains as above)

### 4) Local development
- Backend: `cd backend && go run .` (serves on :8080, in-memory unless `DATABASE_URL` set)
- Frontend: `cd frontend && npm install && npm start` (serves on :3000). The UI will auto-target `http://localhost:8080` for API/WS unless `REACT_APP_*` are set.

### 5) Scaling notes
- Single backend instance is fine. For multiple instances, add Redis Pub/Sub or Postgres LISTEN/NOTIFY to fan out broadcasts across instances.
- Current schema lives in `backend/migrations/0001_init.sql`.

### 6) Security
- Passwords are stored as bcrypt hashes.
- CORS is permissive for demo; if you lock frontend domain, restrict `Access-Control-Allow-Origin` in `enableCors`.
