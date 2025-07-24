const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 9999;
const uploadDir = 'uploads';

// Ensure uploads folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Helper: generate unique filename if duplicate exists
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

// Multer storage config
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

// Serve form
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve uploaded files (optional)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Handle multiple files
app.post('/upload', upload.array('files'), (req, res) => {
  res.send('✅ Files uploaded successfully!');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
