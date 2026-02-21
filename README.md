# YouFaceInsta Backend

Self-hosted backend with yt-dlp for video downloading.

## Deploy to Render (Docker)

1. **Create Render Service**:
   - New Web Service → connect your GitHub repo
   - Root Directory: `youfaceinsta-backend`
   - Runtime: Docker

2. **Docker Settings**:
   - Docker Build Context: `youfaceinsta-backend`
   - Dockerfile Path: `youfaceinsta-backend/Dockerfile`

3. **Deploy**:
   - Click Create Web Service and wait for the service to go live

4. **Update Frontend**:
   - Edit `script.js` in the main site
   - Change `API_URL` to your Render URL

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
cd youfaceinsta-backend
npm install
npm start
```

Server runs on `http://localhost:3000`

## Environment Variables

- `PORT` - Server port (default: 3000)
