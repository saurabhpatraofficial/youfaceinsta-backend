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

// Get video info and direct URL
async function getVideoInfo(url, format) {
    const safeUrl = url.replace(/'/g, "'\\''");
    
    let cmd = 'yt-dlp';
    cmd += ' --no-warnings --no-playlist --geo-bypass';
    cmd += ' -g'; // Get URL
    cmd += ' --print "%(title)s"'; // Get title
    
    if (format === 'audio') {
        cmd += ' -f "bestaudio/best"';
    } else {
        cmd += ' -f "best[ext=mp4]/best"';
    }
    
    cmd += ` '${safeUrl}'`;
    
    const { stdout } = await execAsync(cmd, { timeout: 60000 });
    const lines = stdout.trim().split('\n');
    
    // Last line is title, others are URLs
    const title = lines.pop() || 'download';
    const downloadUrl = lines.find(l => l.startsWith('http'));
    
    if (!downloadUrl) throw new Error('No URL found');
    
    return {
        url: downloadUrl,
        title: title.replace(/[<>:"/\\|?*\n\r]/g, '_').substring(0, 80)
    };
}

// Proxy download - streams the file to user with download headers
app.get('/proxy', async (req, res) => {
    try {
        const { url, filename } = req.query;
        
        if (!url) {
            return res.status(400).json({ error: 'Missing URL' });
        }

        console.log(`Proxying download: ${filename}`);
        
        // Set headers to force download
        res.setHeader('Content-Disposition', `attachment; filename="${filename || 'download.mp4'}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        
        // Fetch and pipe the video
        const protocol = url.startsWith('https') ? https : http;
        
        protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, (videoRes) => {
            // Forward content headers
            if (videoRes.headers['content-length']) {
                res.setHeader('Content-Length', videoRes.headers['content-length']);
            }
            
            // Pipe video to response
            videoRes.pipe(res);
            
            videoRes.on('error', (err) => {
                console.error('Stream error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Download failed' });
                }
            });
        }).on('error', (err) => {
            console.error('Request error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Download failed' });
            }
        });
        
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Main download endpoint - returns proxy URL for actual download
app.post('/download', async (req, res) => {
    try {
        const { url, platform, format, quality } = req.body;

        if (!url || !platform || !format) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!['youtube', 'facebook', 'instagram'].includes(platform)) {
            return res.status(400).json({ error: 'Invalid platform' });
        }

        if (!validateUrl(url, platform)) {
            return res.status(400).json({ error: `Invalid ${platform} URL` });
        }

        console.log(`\n=== Download Request ===`);
        console.log(`Platform: ${platform}, Format: ${format}`);
        console.log(`URL: ${url}`);

        const info = await getVideoInfo(url, format);
        const ext = format === 'audio' ? 'mp3' : 'mp4';
        const filename = `${info.title}.${ext}`;
        
        // Return proxy URL that will force download
        const proxyUrl = `/proxy?url=${encodeURIComponent(info.url)}&filename=${encodeURIComponent(filename)}`;
        
        console.log(`Success! File: ${filename}`);

        res.json({
            success: true,
            downloadUrl: proxyUrl,
            filename: filename,
            title: info.title
        });

    } catch (error) {
        console.error('Error:', error.message);
        if (error.stderr) console.error('STDERR:', error.stderr);
        
        let errorMsg = 'Download failed. Please try again.';
        const errText = (error.message + ' ' + (error.stderr || '')).toLowerCase();
        
        if (errText.includes('private')) {
            errorMsg = 'This video is private';
        } else if (errText.includes('unavailable')) {
            errorMsg = 'Video unavailable';
        } else if (errText.includes('sign in') || errText.includes('age')) {
            errorMsg = 'Video requires login/age verification';
        }

        res.status(500).json({ error: errorMsg });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 YouFaceInsta API running on port ${PORT}`);
});
