// index.js
const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuid } = require('uuid');

const app = express();
const upload = multer({ dest: 'tmp_uploads' });

const PORT = process.env.PORT || 3000;
const SCANS_DIR = path.join(__dirname, 'scans');

// Serve scans folder statically so GLB can be downloaded
app.use('/scans', express.static(SCANS_DIR));

app.use(express.json());

// POST /upload-scan
app.post('/upload-scan', upload.array('files'), async (req, res) => {
  try {
    const jobId = uuid();
    const jobDir = path.join(SCANS_DIR, jobId);
    const imagesDir = path.join(jobDir, 'images');
    const resultDir = path.join(jobDir, 'result');

    await fs.mkdirs(imagesDir);
    await fs.mkdirs(resultDir);

    // Move uploaded images into imagesDir
    await Promise.all(
      req.files.map((file, idx) => {
        const dest = path.join(
          imagesDir,
          `car_${String(idx + 1).padStart(3, '0')}.jpg`
        );
        return fs.move(file.path, dest);
      })
    );

    const job = {
      id: jobId,
      status: 'processing',
      createdAt: new Date().toISOString(),
      error: null,
      resultUrl: null,
    };

    await fs.writeJson(path.join(jobDir, 'job.json'), job, { spaces: 2 });

    // Fake processing: after 10s, copy sample.glb as the result
    setTimeout(async () => {
      try {
        const jobPath = path.join(jobDir, 'job.json');
        if (!(await fs.pathExists(jobPath))) return;

        const doneJob = await fs.readJson(jobPath);

        const sampleGlbSource = path.join(__dirname, 'sample.glb');
        const sampleExists = await fs.pathExists(sampleGlbSource);

        if (sampleExists) {
          const targetGlb = path.join(resultDir, 'car_scan.glb');
          await fs.copy(sampleGlbSource, targetGlb);

          // Base URL:
          // - On Render: RENDER_EXTERNAL_URL, e.g. https://backend-fyp-nt7n.onrender.com
          // - Locally: http://localhost:PORT
          const baseUrl =
            process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

          doneJob.status = 'done';
          doneJob.error = null;
          doneJob.resultUrl = `${baseUrl}/scans/${jobId}/result/car_scan.glb`;
        } else {
          doneJob.status = 'failed';
          doneJob.error = 'sample.glb not found on server';
        }

        await fs.writeJson(jobPath, doneJob, { spaces: 2 });
      } catch (e) {
        console.error('Processing error:', e);
        try {
          const jobPath = path.join(jobDir, 'job.json');
          if (await fs.pathExists(jobPath)) {
            const failedJob = await fs.readJson(jobPath);
            failedJob.status = 'failed';
            failedJob.error = String(e);
            await fs.writeJson(jobPath, failedJob, { spaces: 2 });
          }
        } catch (inner) {
          console.error('Failed to write error to job.json:', inner);
        }
      }
    }, 10000);

    res.json({ id: jobId });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /scan-status/:id
app.get('/scan-status/:id', async (req, res) => {
  try {
    const jobDir = path.join(SCANS_DIR, req.params.id);
    const jobFile = path.join(jobDir, 'job.json');

    if (!(await fs.pathExists(jobFile))) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = await fs.readJson(jobFile);
    res.json(job);
  } catch (err) {
    console.error('Status error:', err);
    res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
