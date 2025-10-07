# 🚀 Deploy to Render (FREE)

## Step-by-Step Deployment

### 1. Backend on Render
1. Go to [render.com](https://render.com) → Sign up/Login
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub account and select `ChatBox` repo
4. Configure:
   - **Name**: `chatbox-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Go`
   - **Build Command**: `go build -o main .`
   - **Start Command**: `./main`
5. Click **"Create Web Service"**

### 2. Database on Render
1. In Render dashboard → **"New +"** → **"PostgreSQL"**
2. Configure:
   - **Name**: `chatbox-db`
   - **Database**: `chatbox`
   - **User**: `chatbox`
   - **Plan**: Free (90 days)
3. Click **"Create Database"**

### 3. Connect Database to Backend
1. Go to your backend service → **"Environment"**
2. Add environment variable:
   - **Key**: `DATABASE_URL`
   - **Value**: Copy from your database's "External Database URL"
3. Add another variable:
   - **Key**: `ALLOWED_ORIGINS`
   - **Value**: `https://your-app-name.vercel.app` (update after frontend deploy)

### 4. Frontend on Vercel
1. Go to [vercel.com](https://vercel.com) → Import Project
2. Select your GitHub repo
3. Configure:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `build`
4. Add Environment Variables:
   - `REACT_APP_API_BASE`: `https://your-backend.onrender.com`
   - `REACT_APP_WS_BASE`: `wss://your-backend.onrender.com`
5. Deploy

### 5. Update CORS
1. Go back to Render backend → Environment
2. Update `ALLOWED_ORIGINS` with your Vercel URL
3. Redeploy backend

## 🎯 URLs After Deployment
- **Frontend**: `https://your-app.vercel.app`
- **Backend**: `https://your-backend.onrender.com`
- **Database**: Managed by Render

## 💰 Cost
- **First 90 days**: FREE
- **After 90 days**: $7/month (database only)
- **Backend**: Always FREE (750 hours/month)

## 🔧 Troubleshooting
- **Backend not starting**: Check logs in Render dashboard
- **Database connection**: Verify DATABASE_URL format
- **CORS errors**: Update ALLOWED_ORIGINS with correct frontend URL
- **WebSocket issues**: Ensure WSS (not WS) in production