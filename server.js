const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 9999;

// Always resolve relative to the location of the running executable or script
const baseDir = path.dirname(process.execPath || __dirname);
 
const uploadDir = path.join(baseDir, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Ensure unique file name by appending numbers
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

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, getUniqueFilename(uploadDir, file.originalname)),
});
const upload = multer({ storage });

// Serve embedded HTML file
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'index.html'); // pkg will bundle this
  fs.readFile(htmlPath, 'utf8', (err, data) => {
    if (err) {
      res.status(500).send('Could not load UI');
    } else {
      res.send(data);
    }
  });
});

app.use('/uploads', express.static(uploadDir));
app.use(express.static(baseDir));
app.post('/upload', upload.array('files'), (req, res) => {
  res.send('✅ Files uploaded!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}`);
});
