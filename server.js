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

        console.log(`Processing: ${platform} | ${format} | ${quality} | ${url}`);

        // Escape URL properly
        const safeUrl = url.replace(/'/g, "'\\''");

        // Build yt-dlp command
        let cmd = 'yt-dlp --no-warnings --no-playlist -g';

        if (format === 'audio') {
            cmd += ' -f "bestaudio"';
        } else {
            if (platform === 'youtube') {
                // For YouTube: try to get a combined format (mp4 with audio)
                // Format 18 = 360p mp4, Format 22 = 720p mp4 (both have audio)
                const qualityFormats = {
                    '4320': 'best[height<=4320]',
                    '2160': 'best[height<=2160]',
                    '1080': 'best[height<=1080]',
                    '720': '22/best[height<=720]',
                    '480': '18/best[height<=480]'
                };
                cmd += ` -f "${qualityFormats[quality] || 'best'}"`;
            } else {
                cmd += ' -f "best"';
            }
        }

        cmd += ` '${safeUrl}'`;

        console.log(`Command: ${cmd}`);

        // Execute yt-dlp
        const { stdout, stderr } = await execAsync(cmd, { 
            timeout: 45000,
            maxBuffer: 1024 * 1024 * 10
        });

        if (stderr) {
            console.log('stderr:', stderr);
        }

        const urls = stdout.trim().split('\n').filter(u => u.startsWith('http'));
        
        if (urls.length === 0) {
            throw new Error('No download URL found');
        }

        console.log(`Found URL: ${urls[0].substring(0, 100)}...`);

        // Get title for filename
        let title = `${platform}_video`;
        try {
            const titleCmd = `yt-dlp --print "%(title)s" --no-warnings '${safeUrl}'`;
            const titleResult = await execAsync(titleCmd, { timeout: 15000 });
            title = titleResult.stdout.trim().replace(/[<>:"/\\|?*\n]/g, '_').substring(0, 80) || title;
        } catch (e) {
            console.log('Could not get title:', e.message);
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
        if (error.stderr) console.error('stderr:', error.stderr);
        
        let errorMsg = 'Download failed. Please try again.';
        
        if (error.message.includes('Private')) {
            errorMsg = 'This video is private';
        } else if (error.message.includes('unavailable') || error.message.includes('not available')) {
            errorMsg = 'Video is unavailable';
        } else if (error.message.includes('Sign in') || error.message.includes('login')) {
            errorMsg = 'This content requires login';
        } else if (error.message.includes('timeout') || error.message.includes('TIMEOUT')) {
            errorMsg = 'Request timed out. Try again.';
        } else if (error.message.includes('No video formats') || error.message.includes('no formats')) {
            errorMsg = 'No downloadable format found';
        }

        res.status(500).json({ error: errorMsg });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 YouFaceInsta API running on port ${PORT}`);
});
