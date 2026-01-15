const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const https = require('https');
const http = require('http');

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Store video URLs temporarily (in production, use Redis)
const videoCache = new Map();

// URL validators
const PLATFORM_PATTERNS = {
    youtube: /^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\/.+/i,
    facebook: /^(https?:\/\/)?(www\.|m\.|web\.)?(facebook\.com|fb\.watch)\/.+/i,
    instagram: /^(https?:\/\/)?(www\.)?instagram\.com\/(p|reel|reels|tv)\/.+/i
};

function validateUrl(url, platform) {
    return PLATFORM_PATTERNS[platform]?.test(url);
}

// Health check
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'YouFaceInsta API' });
});

// File download endpoint - proxies the video with download headers
app.get('/file/:id', async (req, res) => {
    const { id } = req.params;
    const cached = videoCache.get(id);
    
    if (!cached) {
        return res.status(404).json({ error: 'Link expired. Please try again.' });
    }
    
    const { url, filename } = cached;
    console.log(`Downloading: ${filename}`);
    
    try {
        // Set download headers
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        
        const protocol = url.startsWith('https') ? https : http;
        
        const request = protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Accept-Encoding': 'identity',
                'Connection': 'keep-alive'
            }
        }, (response) => {
            // Handle redirects
            if (response.statusCode === 302 || response.statusCode === 301) {
                const redirectUrl = response.headers.location;
                console.log('Redirecting to:', redirectUrl);
                const proto = redirectUrl.startsWith('https') ? https : http;
                proto.get(redirectUrl, (redirectRes) => {
                    if (redirectRes.headers['content-length']) {
                        res.setHeader('Content-Length', redirectRes.headers['content-length']);
                    }
                    redirectRes.pipe(res);
                }).on('error', (e) => {
                    console.error('Redirect error:', e);
                    if (!res.headersSent) res.status(500).end();
                });
                return;
            }
            
            if (response.headers['content-length']) {
                res.setHeader('Content-Length', response.headers['content-length']);
            }
            
            response.pipe(res);
            
            response.on('error', (err) => {
                console.error('Response error:', err);
            });
        });
        
        request.on('error', (err) => {
            console.error('Request error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Download failed' });
            }
        });
        
    } catch (error) {
        console.error('File error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Main download endpoint
app.post('/download', async (req, res) => {
    try {
        const { url, platform, format } = req.body;

        if (!url || !platform || !format) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!validateUrl(url, platform)) {
            return res.status(400).json({ error: 'Invalid URL' });
        }

        console.log(`\nProcessing: ${platform} | ${format} | ${url}`);

        const safeUrl = url.replace(/'/g, "'\\''");

        // Get video URL
        let cmd = 'yt-dlp --no-warnings --no-playlist --geo-bypass -g';
        cmd += format === 'audio' ? ' -f "bestaudio/best"' : ' -f "best"';
        cmd += ` '${safeUrl}'`;

        const { stdout } = await execAsync(cmd, { timeout: 60000 });
        const videoUrl = stdout.trim().split('\n').find(u => u.startsWith('http'));
        
        if (!videoUrl) throw new Error('No URL found');

        // Get title
        let title = `${platform}_${Date.now()}`;
        try {
            const { stdout: titleOut } = await execAsync(
                `yt-dlp --print "%(title)s" --no-warnings '${safeUrl}'`, 
                { timeout: 15000 }
            );
            title = titleOut.trim().replace(/[<>:"/\\|?*\n\r]/g, '_').substring(0, 60) || title;
        } catch (e) {}

        const ext = format === 'audio' ? 'mp3' : 'mp4';
        const filename = `${title}.${ext}`;
        
        // Generate unique ID and cache the URL
        const id = Math.random().toString(36).substring(2, 15);
        videoCache.set(id, { url: videoUrl, filename });
        
        // Clean up cache after 5 minutes
        setTimeout(() => videoCache.delete(id), 5 * 60 * 1000);

        console.log(`Success! ID: ${id}, File: ${filename}`);

        res.json({
            success: true,
            downloadPath: `/file/${id}`,
            filename: filename,
            title: title
        });

    } catch (error) {
        console.error('Error:', error.message);
        
        let errorMsg = 'Download failed. Try again.';
        const err = (error.message + ' ' + (error.stderr || '')).toLowerCase();
        
        if (err.includes('private')) errorMsg = 'Video is private';
        else if (err.includes('unavailable')) errorMsg = 'Video unavailable';
        else if (err.includes('sign in')) errorMsg = 'Requires login';

        res.status(500).json({ error: errorMsg });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 YouFaceInsta API on port ${PORT}`);
});
