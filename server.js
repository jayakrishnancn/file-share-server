const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 9999;
const uploadDir = 'uploads';

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Generate unique filename if duplicate
function getUniqueFilename(folder, originalName) {
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext);
  let filename = originalName;
  let counter = 1;

  while (fs.existsSync(path.join(folder, filename))) {
    filename = `${base}(${counter})${ext}`;
    counter++;
  }

  return filename;
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const safeName = getUniqueFilename(uploadDir, file.originalname);
    cb(null, safeName);
  }
});

const upload = multer({ storage });

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.post('/upload', upload.array('files'), (req, res) => {
  res.send('✅ Files uploaded successfully!');
});

app.listen(PORT, () => {
  console.log(`File upload server running at http://localhost:${PORT}`);
});
