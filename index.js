const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuid } = require('uuid');

const app = express();
const upload = multer({ dest: 'tmp_uploads' });

const PORT = process.env.PORT || 3000;
const SCANS_DIR = path.join(__dirname, 'scans');

// IMPORTANT: serve scans folder statically, so GLB can be downloaded
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

    // Move uploaded files into imagesDir
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

    // TODO: replace this timeout with real photogrammetry (Meshroom/COLMAP)
    setTimeout(async () => {
      const jobPath = path.join(jobDir, 'job.json');
      if (!(await fs.pathExists(jobPath))) return;

      const doneJob = await fs.readJson(jobPath);

      try {
        // For now, just copy a sample GLB into the result folder
        // In real setup, you would create car_scan.glb here.
        const sampleGlbSource = path.join(__dirname, 'sample.glb');
        const sampleExists = await fs.pathExists(sampleGlbSource);

        if (sampleExists) {
          const targetGlb = path.join(resultDir, 'car_scan.glb');
          await fs.copy(sampleGlbSource, targetGlb);

          // Construct public URL for GLB
          // On Render, use your Render base URL; locally, use http://localhost
          const baseUrl =
            process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT;
          doneJob.status = 'done';
          doneJob.resultUrl = `${baseUrl}/scans/${jobId}/result/car_scan.glb`;
        } else {
          doneJob.status = 'failed';
          doneJob.error = 'sample.glb not found on server';
        }
      } catch (e) {
        console.error('Processing error:', e);
        doneJob.status = 'failed';
        doneJob.error = String(e);
      }

      await fs.writeJson(jobPath, doneJob, { spaces: 2 });
    }, 10000);

    res.json({ id: jobId });
  } catch (err) {
    console.error(err);
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
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
