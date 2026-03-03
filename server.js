/**
 * WAVO AI - Backend Export Service for OPAL / Production
 * Handles fallback server-side rendering using FFmpeg when client WASM is not available.
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const uuid = require('crypto').randomUUID;

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname))); // Serve client files
app.use(express.json());

// Set up temporary storage for incoming files
const upload = multer({ dest: 'tmp_uploads/' });

app.post('/api/export', upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'image', maxCount: 1 }]), (req, res) => {
    try {
        if (!req.files || !req.files.audio) {
            return res.status(400).json({ error: "Missing uploaded audio file." });
        }

        const audioFile = req.files.audio[0];
        const imageFile = req.files.image ? req.files.image[0] : null;

        // Parse frontend JSON settings
        let settings = {};
        if (req.body.settings) {
            try {
                settings = JSON.parse(req.body.settings);
            } catch (e) {
                console.error("Invalid settings JSON", e);
            }
        }

        const jobId = uuid();
        const outputFilename = `wavo_${jobId}.mp4`;
        const outputPath = path.join(__dirname, 'tmp_uploads', outputFilename);

        // Map settings to ffmpeg variables
        // This is a simplified fallback that produces a basic looping audio video
        // In a real production environment, you would map `settings` to complex FFmpeg drawtext/showwavesp filters

        let ffmpegCmd = `ffmpeg -y -i "${audioFile.path}"`;

        if (imageFile) {
            ffmpegCmd += ` -loop 1 -i "${imageFile.path}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" "${outputPath}"`;
        } else {
            // Generate a black background video with audio
            ffmpegCmd += ` -f lavfi -i color=c=black:s=1080x1920:r=30 -c:v libx264 -c:a aac -b:a 192k -pix_fmt yuv420p -shortest "${outputPath}"`;
        }

        console.log(`[JOB ${jobId}] Starting FFmpeg:`, ffmpegCmd);

        exec(ffmpegCmd, (error, stdout, stderr) => {
            // Clean up inputs
            fs.unlinkSync(audioFile.path);
            if (imageFile) fs.unlinkSync(imageFile.path);

            if (error) {
                console.error(`[JOB ${jobId}] FFmpeg Error:`, stderr);
                return res.status(500).json({ error: "FFmpeg Rendering Failed" });
            }

            console.log(`[JOB ${jobId}] Finished. Serving file...`);

            // Send exactly the generated MP4 file to frontend buffer
            res.download(outputPath, 'wavo_export.mp4', (err) => {
                if (err) console.error("Error sending file:", err);
                // Clean up output
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            });
        });

    } catch (err) {
        console.error("Export endpoint error:", err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`WAVO AI Backend Server running on port ${PORT}`);
    console.log(`In OPAL, ensure FFmpeg CLI is installed on your container runner!`);
});
