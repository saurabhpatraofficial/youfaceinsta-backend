const express = require('express');
const cors = require('cors');
const ytdlp = require('yt-dlp-exec');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Platform URL validators
const PLATFORM_PATTERNS = {
    youtube: [
        /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/i,
        /^(https?:\/\/)?(m\.)?youtube\.com\/.+/i
    ],
    facebook: [
        /^(https?:\/\/)?(www\.)?(facebook\.com|fb\.watch)\/.+/i,
        /^(https?:\/\/)?(m\.)?facebook\.com\/.+/i
    ],
    instagram: [
        /^(https?:\/\/)?(www\.)?instagram\.com\/(p|reel|reels|tv|stories)\/.+/i
    ]
};

function validateUrl(url, platform) {
    const patterns = PLATFORM_PATTERNS[platform];
    if (!patterns) return false;
    return patterns.some(pattern => pattern.test(url));
}

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'YouFaceInsta Backend API',
        endpoints: {
            download: 'POST /download',
            info: 'POST /info'
        }
    });
});

// Get video info without downloading
app.post('/info', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        const info = await ytdlp(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true
        });

        res.json({
            success: true,
            title: info.title,
            duration: info.duration,
            thumbnail: info.thumbnail,
            formats: info.formats?.map(f => ({
                formatId: f.format_id,
                ext: f.ext,
                resolution: f.resolution,
                filesize: f.filesize
            }))
        });
    } catch (error) {
        console.error('Info error:', error.message);
        res.status(500).json({ error: 'Failed to get video info' });
    }
});

// Download endpoint - returns direct URL
app.post('/download', async (req, res) => {
    try {
        const { url, platform, format, quality } = req.body;

        // Validate request
        if (!url || !platform || !format) {
            return res.status(400).json({ 
                error: 'Missing required fields: url, platform, format' 
            });
        }

        if (!['youtube', 'facebook', 'instagram'].includes(platform)) {
            return res.status(400).json({ error: 'Invalid platform' });
        }

        if (!validateUrl(url, platform)) {
            return res.status(400).json({ error: `Invalid ${platform} URL` });
        }

        console.log(`Processing ${platform} ${format} request for: ${url}`);

        // Build yt-dlp options
        let ytdlpOptions = {
            getUrl: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true
        };

        if (format === 'audio') {
            // Audio extraction
            ytdlpOptions.extractAudio = true;
            ytdlpOptions.audioFormat = 'mp3';
            ytdlpOptions.format = 'bestaudio/best';
            
            if (platform === 'youtube' && quality) {
                const bitrateMap = { '320': '320K', '240': '240K', '160': '160K' };
                ytdlpOptions.audioQuality = bitrateMap[quality] || '320K';
            }
        } else {
            // Video download
            if (platform === 'youtube' && quality) {
                const qualityMap = {
                    '4320': 'bestvideo[height<=4320]+bestaudio/best[height<=4320]',
                    '2160': 'bestvideo[height<=2160]+bestaudio/best[height<=2160]',
                    '1080': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
                    '720': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
                    '480': 'bestvideo[height<=480]+bestaudio/best[height<=480]'
                };
                ytdlpOptions.format = qualityMap[quality] || 'bestvideo+bestaudio/best';
            } else {
                ytdlpOptions.format = 'bestvideo+bestaudio/best';
            }
        }

        // Get download URL
        const output = await ytdlp(url, ytdlpOptions);
        
        // Parse output - yt-dlp returns URL(s) as string
        const urls = output.trim().split('\n').filter(u => u.startsWith('http'));
        
        if (urls.length === 0) {
            throw new Error('No download URL found');
        }

        // Get video title for filename
        let filename = `${platform}_download`;
        try {
            const info = await ytdlp(url, {
                print: '%(title)s',
                noWarnings: true
            });
            filename = info.trim().replace(/[<>:"/\\|?*]/g, '_');
        } catch (e) {
            console.log('Could not get title:', e.message);
        }

        const ext = format === 'audio' ? 'mp3' : 'mp4';

        res.json({
            success: true,
            directUrl: urls[0],
            filename: `${filename}.${ext}`,
            platform,
            format
        });

    } catch (error) {
        console.error('Download error:', error.message);
        
        let errorMessage = 'Download failed. Please try again.';
        
        if (error.message.includes('Private video')) {
            errorMessage = 'This video is private';
        } else if (error.message.includes('Video unavailable')) {
            errorMessage = 'Video is unavailable';
        } else if (error.message.includes('Sign in')) {
            errorMessage = 'This content requires login';
        } else if (error.message.includes('not found')) {
            errorMessage = 'Content not found';
        }

        res.status(500).json({ error: errorMessage });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 YouFaceInsta Backend running on port ${PORT}`);
});
