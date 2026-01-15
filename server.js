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

// Download endpoint - returns direct URL for browser download
app.post('/download', async (req, res) => {
    try {
        const { url, platform, format } = req.body;

        if (!url || !platform || !format) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!validateUrl(url, platform)) {
            return res.status(400).json({ error: 'Invalid URL' });
        }

        console.log(`Processing: ${platform} | ${format} | ${url}`);

        const safeUrl = url.replace(/'/g, "'\\''");

        // Get video URL using yt-dlp
        let cmd = 'yt-dlp --no-warnings --no-playlist --geo-bypass -g';
        cmd += format === 'audio' ? ' -f "bestaudio/best"' : ' -f "best"';
        cmd += ` '${safeUrl}'`;

        const { stdout } = await execAsync(cmd, { timeout: 60000 });
        const videoUrl = stdout.trim().split('\n').find(u => u.startsWith('http'));
        
        if (!videoUrl) throw new Error('No URL found');

        // Get title
        let title = `${platform}_${Date.now()}`;
        try {
            const { stdout: t } = await execAsync(
                `yt-dlp --print "%(title)s" --no-warnings '${safeUrl}'`, 
                { timeout: 15000 }
            );
            title = t.trim().replace(/[<>:"/\\|?*\n\r]/g, '_').substring(0, 60) || title;
        } catch (e) {}

        const ext = format === 'audio' ? 'mp3' : 'mp4';

        console.log(`Success: ${title}.${ext}`);

        res.json({
            success: true,
            directUrl: videoUrl,
            filename: `${title}.${ext}`,
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
