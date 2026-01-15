const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');

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

// Download endpoint
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

        console.log(`Processing: ${platform} | ${format} | ${url}`);

        // Build yt-dlp command
        let cmd = 'yt-dlp';
        cmd += ' --no-warnings';
        cmd += ' --no-playlist';
        cmd += ' -g'; // Get direct URL only

        if (format === 'audio') {
            cmd += ' -f "bestaudio/best"';
        } else {
            // Video with quality
            const qualityMap = {
                '4320': 'bestvideo[height<=4320]+bestaudio/best[height<=4320]/best',
                '2160': 'bestvideo[height<=2160]+bestaudio/best[height<=2160]/best',
                '1080': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
                '720': 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
                '480': 'bestvideo[height<=480]+bestaudio/best[height<=480]/best'
            };
            const formatStr = qualityMap[quality] || qualityMap['720'];
            cmd += ` -f "${formatStr}"`;
        }

        // Escape URL properly
        const safeUrl = url.replace(/"/g, '\\"');
        cmd += ` "${safeUrl}"`;

        console.log(`Running: ${cmd}`);

        // Execute yt-dlp
        const { stdout, stderr } = await execAsync(cmd, { 
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 5
        });

        const urls = stdout.trim().split('\n').filter(u => u.startsWith('http'));
        
        if (urls.length === 0) {
            throw new Error('No download URL found');
        }

        // Get title for filename
        let title = 'download';
        try {
            const titleCmd = `yt-dlp --print "%(title)s" --no-warnings "${safeUrl}"`;
            const titleResult = await execAsync(titleCmd, { timeout: 10000 });
            title = titleResult.stdout.trim().replace(/[<>:"/\\|?*]/g, '_').substring(0, 100) || 'download';
        } catch (e) {
            console.log('Could not get title');
        }

        const ext = format === 'audio' ? 'mp3' : 'mp4';

        res.json({
            success: true,
            directUrl: urls[0],
            filename: `${title}.${ext}`,
            title: title
        });

    } catch (error) {
        console.error('Error:', error.message);
        
        let errorMsg = 'Download failed. Please try again.';
        
        if (error.message.includes('Private video')) {
            errorMsg = 'This video is private';
        } else if (error.message.includes('Video unavailable')) {
            errorMsg = 'Video is unavailable';
        } else if (error.message.includes('Sign in')) {
            errorMsg = 'This content requires login';
        } else if (error.message.includes('timeout')) {
            errorMsg = 'Request timed out. Try again.';
        }

        res.status(500).json({ error: errorMsg });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 YouFaceInsta API running on port ${PORT}`);
});
