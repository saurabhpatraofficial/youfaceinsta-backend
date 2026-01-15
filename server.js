const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Update yt-dlp on startup
async function updateYtDlp() {
    try {
        console.log('Updating yt-dlp...');
        await execAsync('yt-dlp -U', { timeout: 30000 });
        console.log('yt-dlp updated!');
    } catch (e) {
        console.log('yt-dlp update skipped:', e.message);
    }
}
updateYtDlp();

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

        console.log(`\n=== New Request ===`);
        console.log(`Platform: ${platform}`);
        console.log(`Format: ${format}`);
        console.log(`Quality: ${quality}`);
        console.log(`URL: ${url}`);

        // Escape URL properly for shell
        const safeUrl = url.replace(/'/g, "'\\''");

        // Build yt-dlp command with extra options to bypass restrictions
        let cmd = 'yt-dlp';
        cmd += ' --no-warnings';
        cmd += ' --no-playlist';
        cmd += ' --no-check-certificates';
        cmd += ' --prefer-insecure';
        cmd += ' --geo-bypass';
        cmd += ' -g'; // Get direct URL

        if (format === 'audio') {
            cmd += ' -f "bestaudio/best"';
        } else {
            cmd += ' -f "best[ext=mp4]/best"';
        }

        cmd += ` '${safeUrl}'`;

        console.log(`Command: ${cmd}`);

        // Execute yt-dlp
        const { stdout, stderr } = await execAsync(cmd, { 
            timeout: 60000,
            maxBuffer: 1024 * 1024 * 10
        });

        if (stderr) {
            console.log('STDERR:', stderr);
        }

        console.log('STDOUT:', stdout);

        const urls = stdout.trim().split('\n').filter(u => u.startsWith('http'));
        
        if (urls.length === 0) {
            throw new Error('No download URL in output');
        }

        const downloadUrl = urls[0];
        console.log(`Download URL: ${downloadUrl.substring(0, 80)}...`);

        // Get title
        let title = `${platform}_video_${Date.now()}`;
        try {
            const titleCmd = `yt-dlp --print "%(title)s" --no-warnings '${safeUrl}'`;
            const titleResult = await execAsync(titleCmd, { timeout: 15000 });
            const cleanTitle = titleResult.stdout.trim().replace(/[<>:"/\\|?*\n\r]/g, '_').substring(0, 80);
            if (cleanTitle) title = cleanTitle;
        } catch (e) {
            console.log('Title fetch failed:', e.message);
        }

        const ext = format === 'audio' ? 'mp3' : 'mp4';

        console.log(`Success! Returning: ${title}.${ext}`);

        res.json({
            success: true,
            directUrl: downloadUrl,
            filename: `${title}.${ext}`,
            title: title
        });

    } catch (error) {
        console.error('\n=== ERROR ===');
        console.error('Message:', error.message);
        if (error.stderr) console.error('STDERR:', error.stderr);
        if (error.stdout) console.error('STDOUT:', error.stdout);
        
        let errorMsg = 'Download failed. Please try again.';
        const errText = (error.message + ' ' + (error.stderr || '')).toLowerCase();
        
        if (errText.includes('private')) {
            errorMsg = 'This video is private';
        } else if (errText.includes('unavailable') || errText.includes('not available') || errText.includes('video is not available')) {
            errorMsg = 'Video unavailable. Try a different video.';
        } else if (errText.includes('sign in') || errText.includes('login') || errText.includes('age')) {
            errorMsg = 'This video requires login/age verification';
        } else if (errText.includes('timeout')) {
            errorMsg = 'Request timed out. Try again.';
        } else if (errText.includes('copyright') || errText.includes('blocked')) {
            errorMsg = 'Video is blocked/copyrighted';
        }

        res.status(500).json({ error: errorMsg });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 YouFaceInsta API running on port ${PORT}`);
});
