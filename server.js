const express = require('express');
const path = require('path');
const fs = require('fs');
const busboy = require('busboy');

const app = express();
const PORT = 6748;

const isPkg = typeof process.pkg !== 'undefined';
const baseDir = isPkg ? path.dirname(process.execPath) : __dirname;
const uploadDir = path.join(baseDir, 'uploads');

// Ensure uploads folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Serve embedded HTML
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'index.html');
  fs.readFile(htmlPath, 'utf8', (err, data) => {
    if (err) {
      res.status(500).send('Error loading UI');
    } else {
      res.send(data);
    }
  });
});

app.use('/uploads', express.static(uploadDir));

// File upload handler with console progress
app.post('/upload', (req, res) => {
  const bb = busboy({ headers: req.headers });
  let uploadedFiles = [];

  bb.on('file', (name, file, info) => {
    const { filename } = info;
    const saveName = getUniqueFilename(uploadDir, filename);
    const savePath = path.join(uploadDir, saveName);
    const writeStream = fs.createWriteStream(savePath);

    let totalBytes = 0;

    console.log(`⬇️ Uploading: ${filename}`);

    file.on('data', (chunk) => {
      totalBytes += chunk.length;
      process.stdout.write(`📦 ${filename}: ${Math.round(totalBytes / 1024)} KB uploaded\r`);
    });

    file.pipe(writeStream);

    file.on('end', () => {
      console.log(`\n✅ Uploaded: ${filename} as ${saveName}`);
      uploadedFiles.push(saveName);
    });
  });

  bb.on('finish', () => {
    res.status(200).send('Files uploaded successfully!');
  });

  req.pipe(bb);
});

// Util: unique file names with number suffix
function getUniqueFilename(folder, originalName) {
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext);
  let filename = originalName;
  let count = 1;

  while (fs.existsSync(path.join(folder, filename))) {
    filename = `${base}(${count})${ext}`;
    count++;
  }

  return filename;
}

app.listen(PORT, () => {
  console.log(`🚀 Upload server running at http://localhost:${PORT}`);
});
