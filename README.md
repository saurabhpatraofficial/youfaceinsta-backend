# YouFaceInsta Backend

Self-hosted backend with yt-dlp for video downloading.

## Deploy to Railway (Free)

1. **Create Railway Account**: Go to [railway.app](https://railway.app) and sign up

2. **Deploy from GitHub**:
   - Push this `backend` folder to a new GitHub repo
   - In Railway, click "New Project" → "Deploy from GitHub repo"
   - Select your repo
   - Railway will auto-detect and deploy

3. **Get Your API URL**:
   - After deployment, go to Settings → Domains
   - Click "Generate Domain"
   - Copy the URL (e.g., `https://your-app.up.railway.app`)

4. **Update Frontend**:
   - Edit `script.js` in the main site
   - Change `API_BASE_URL` to your Railway URL

## API Endpoints

### POST /download
Download video/audio from URL.

```json
{
  "url": "https://youtube.com/watch?v=...",
  "platform": "youtube",
  "format": "video",
  "quality": "1080"
}
```

### POST /info
Get video information.

```json
{
  "url": "https://youtube.com/watch?v=..."
}
```

## Local Development

```bash
cd backend
npm install
npm start
```

Server runs on `http://localhost:3000`

## Environment Variables

- `PORT` - Server port (default: 3000)
