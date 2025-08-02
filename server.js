const express = require('express');
const path = require('path');
const fs = require('fs');
const busboy = require('busboy');

const app = express();
const PORT = 6748;
const MAX_FILE_SIZE = 100 * 1024 * 1024 * 1024; // 100GB limit

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
      formatResponse(res, 500, { error: 'Error loading UI' });
    } else {
      res.send(data); // Keep as HTML for browser
    }
  });
});

app.use('/uploads', express.static(uploadDir));

// Sanitize filename to prevent directory traversal and invalid chars
function sanitizeFilename(filename) {
  // Remove path traversal and normalize
  const sanitized = path.basename(filename).replace(/[^a-zA-Z0-9.-]/g, '_');
  return sanitized || 'unnamed_file';
}

// Cleanup incomplete file on error
function cleanupFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('Error cleaning up file:', err);
  }
}

// Helper function to format response based on Accept header
function formatResponse(res, status, data) {
  const acceptHeader = res.req.headers.accept || 'text/plain';
  
  if (acceptHeader.includes('application/json')) {
    // Return JSON when explicitly requested
    res.status(status).json(data);
  } else {
    // Default to text/plain
    if (typeof data === 'string') {
      res.status(status).type('text').send(data);
    } else {
      res.status(status).type('text').send(data.message || JSON.stringify(data));
    }
  }
}

// File upload handler with console progress
app.post('/upload', (req, res) => {
  // Check content-length
  const contentLength = parseInt(req.headers['content-length'], 10);
  if (contentLength && contentLength > MAX_FILE_SIZE) {
    return formatResponse(res, 413, { error: `File size exceeds limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB` });
  }

  const contentType = req.headers['content-type'] || '';
  if (contentType.startsWith('multipart/form-data')) {
    // Use busboy for multipart (multiple files)
    let uploadedFiles = [];
    let hasError = false;
    let bb;
    try {
      bb = busboy({ 
        headers: req.headers,
        limits: { fileSize: MAX_FILE_SIZE }
      });
    } catch (err) {
      return formatResponse(res, 400, { error: 'Malformed multipart/form-data request' });
    }
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
      file.on('error', (err) => {
        hasError = true;
        console.error(`❌ Error uploading ${filename}:`, err.message);
        writeStream.destroy();
        cleanupFile(savePath);
      });
      writeStream.on('error', (err) => {
        hasError = true;
        console.error(`❌ Error saving ${filename}:`, err.message);
        cleanupFile(savePath);
      });
    });
    bb.on('error', (err) => {
      hasError = true;
      console.error('❌ Busboy error:', err.message);
      res.status(400).send('Error processing upload.');
    });
    bb.on('finish', () => {
      if (hasError) {
        return; // Error already handled
      }
      formatResponse(res, 200, { 
        message: 'Files uploaded successfully!',
        files: uploadedFiles
      });
    });
    req.pipe(bb);
  } else {
    // Handle non-multipart uploads (single file, any type)
    let filename = sanitizeFilename(req.headers['x-filename'] || `upload_${Date.now()}`);
    const saveName = getUniqueFilename(uploadDir, filename);
    const savePath = path.join(uploadDir, saveName);
    const writeStream = fs.createWriteStream(savePath);
    let totalBytes = 0;
    let hasError = false;
    console.log(`⬇️ Uploading: ${filename}`);
    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      process.stdout.write(`📦 ${filename}: ${Math.round(totalBytes / 1024)} KB uploaded\r`);
    });
    req.pipe(writeStream);
    
    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_FILE_SIZE) {
        hasError = true;
        writeStream.destroy();
        cleanupFile(savePath);
        if (!res.headersSent) {
          formatResponse(res, 413, { error: `File size exceeds limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB` });
        }
        return;
      }
      process.stdout.write(`📦 ${filename}: ${Math.round(totalBytes / 1024)} KB uploaded\r`);
    });

    req.on('end', () => {
      if (hasError) return; // Error already handled
      if (totalBytes === 0) {
        cleanupFile(savePath);
        return formatResponse(res, 400, { error: 'Empty file' });
      }
      console.log(`\n✅ Uploaded: ${filename} as ${saveName}`);
      formatResponse(res, 200, { 
        message: 'File uploaded successfully!',
        file: saveName
      });
    });

    req.on('error', (err) => {
      hasError = true;
      console.error(`❌ Error uploading ${filename}:`, err.message);
      writeStream.destroy();
      cleanupFile(savePath);
      if (!res.headersSent) {
        formatResponse(res, 500, { error: 'Error uploading file' });
      }
    });

    writeStream.on('error', (err) => {
      hasError = true;
      console.error(`❌ Error saving ${filename}:`, err.message);
      cleanupFile(savePath);
      if (!res.headersSent) {
        formatResponse(res, 500, { error: 'Error saving file' });
      }
    });
  }
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
