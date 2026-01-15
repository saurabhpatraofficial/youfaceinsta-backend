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
        const { url, platform, format } = req.body;

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

        const safeUrl = url.replace(/'/g, "'\\''");

        // Build yt-dlp command
        let cmd = 'yt-dlp --no-warnings --no-playlist --geo-bypass -g';
        
        if (format === 'audio') {
            cmd += ' -f "bestaudio/best"';
        } else {
            cmd += ' -f "best"';
        }
        
        cmd += ` '${safeUrl}'`;

        console.log(`Command: ${cmd}`);

        const { stdout, stderr } = await execAsync(cmd, { 
            timeout: 60000,
            maxBuffer: 1024 * 1024 * 10
        });

        if (stderr) console.log('stderr:', stderr);

        const urls = stdout.trim().split('\n').filter(u => u.startsWith('http'));
        
        if (urls.length === 0) {
            throw new Error('No download URL found');
        }

        // Get title
        let title = `${platform}_download`;
        try {
            const titleCmd = `yt-dlp --print "%(title)s" --no-warnings '${safeUrl}'`;
            const titleResult = await execAsync(titleCmd, { timeout: 15000 });
            title = titleResult.stdout.trim().replace(/[<>:"/\\|?*\n\r]/g, '_').substring(0, 80) || title;
        } catch (e) {
            console.log('Title error:', e.message);
        }

        const ext = format === 'audio' ? 'mp3' : 'mp4';

        console.log(`Success: ${title}`);

        res.json({
            success: true,
            directUrl: urls[0],
            filename: `${title}.${ext}`,
            title: title
        });

    } catch (error) {
        console.error('Error:', error.message);
        if (error.stderr) console.error('stderr:', error.stderr);
        
        let errorMsg = 'Download failed. Please try again.';
        const errText = (error.message + ' ' + (error.stderr || '')).toLowerCase();
        
        if (errText.includes('private')) errorMsg = 'Video is private';
        else if (errText.includes('unavailable')) errorMsg = 'Video unavailable';
        else if (errText.includes('sign in')) errorMsg = 'Requires login';

        res.status(500).json({ error: errorMsg });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 YouFaceInsta API running on port ${PORT}`);
});
