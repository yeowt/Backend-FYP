const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuid } = require('uuid');

const app = express();
const upload = multer({ dest: 'tmp_uploads' });

const PORT = 3000;
const SCANS_DIR = path.join(__dirname, 'scans');

app.use(express.json());

// POST /upload-scan
app.post('/upload-scan', upload.array('files'), async (req, res) => {
  try {
    const jobId = uuid();
    const jobDir = path.join(SCANS_DIR, jobId);
    const imagesDir = path.join(jobDir, 'images');

    await fs.mkdirs(imagesDir);

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

    setTimeout(async () => {
      const jobPath = path.join(jobDir, 'job.json');
      if (!(await fs.pathExists(jobPath))) return;

      const doneJob = await fs.readJson(jobPath);
      doneJob.status = 'done';
      doneJob.resultUrl = `https://example.com/car_scan.glb`;
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
  console.log(`Backend listening on http://localhost:${PORT}`);
});