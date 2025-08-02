const express = require('express');
const path = require('path');
const fs = require('fs');
const busboy = require('busboy');
const chokidar = require('chokidar');

const app = express();
const PORT = 6748;

// Store connected SSE clients
const clients = new Set();
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

// Get file list helper function
function getFileList() {
  try {
    const files = fs.readdirSync(uploadDir);
    const fileDetails = files.map(filename => {
      const filePath = path.join(uploadDir, filename);
      try {
        const stats = fs.statSync(filePath);
        return {
          name: filename,
          size: stats.size,
          time: stats.mtime
        };
      } catch (err) {
        return null;
      }
    }).filter(Boolean);
    
    // Sort by most recent first
    return fileDetails.sort((a, b) => b.time - a.time);
  } catch (err) {
    console.error('Error reading file list:', err);
    return [];
  }
}

// List uploaded files
app.get('/uploads', (req, res) => {
  const fileDetails = getFileList();
  formatResponse(res, 200, fileDetails);
});

// SSE endpoint for file updates
app.get('/uploads/events', (req, res) => {
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Send initial file list
  const data = JSON.stringify(getFileList());
  res.write(`data: ${data}\n\n`);

  // Add client to the set
  const client = res;
  clients.add(client);

  // Remove client on connection close
  req.on('close', () => {
    clients.delete(client);
  });
});

// Get file extension from MIME type
function getExtensionFromMime(mimeType) {
  const mimeMap = {
    // Images
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'image/tiff': '.tiff',
    'image/x-icon': '.ico',
    // Videos
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/x-matroska': '.mkv',
    'video/webm': '.webm',
    'video/x-ms-wmv': '.wmv',
    'video/mpeg': '.mpeg',
    // Audio
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/webm': '.weba',
    'audio/ogg': '.ogg',
    'audio/aac': '.aac',
    'audio/midi': '.midi',
    'audio/x-m4a': '.m4a',
    // Documents
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    // Archives
    'application/zip': '.zip',
    'application/x-rar-compressed': '.rar',
    'application/x-7z-compressed': '.7z',
    'application/x-tar': '.tar',
    'application/gzip': '.gz',
    // Text
    'text/plain': '.txt',
    'text/html': '.html',
    'text/css': '.css',
    'text/javascript': '.js',
    'text/csv': '.csv',
    'text/xml': '.xml',
    'text/markdown': '.md',
    // Programming
    'application/json': '.json',
    'application/javascript': '.js',
    'application/typescript': '.ts',
    'application/x-httpd-php': '.php',
    'application/x-python-code': '.py',
    'text/x-java-source': '.java',
    'text/x-c': '.c',
    'text/x-c++': '.cpp',
    // Fonts
    'font/ttf': '.ttf',
    'font/otf': '.otf',
    'font/woff': '.woff',
    'font/woff2': '.woff2',
    // Others
    'application/octet-stream': '.bin',
    'application/x-executable': '.exe',
    'application/vnd.android.package-archive': '.apk'
  };
  return mimeMap[mimeType] || '';
}

// Sanitize filename to prevent directory traversal and invalid chars
function sanitizeFilename(filename, mimeType) {
  // Remove path traversal and normalize
  let sanitized = path.basename(filename).replace(/[^a-zA-Z0-9.-]/g, '_');
  
  // If no extension and we have a MIME type, add the appropriate extension
  if (!path.extname(sanitized) && mimeType) {
    const ext = getExtensionFromMime(mimeType);
    if (ext) {
      sanitized += ext;
    }
  }
  
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
      const { filename, mimeType } = info;
      const saveName = getUniqueFilename(uploadDir, sanitizeFilename(filename, mimeType));
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
    let filename = sanitizeFilename(
      req.headers['x-filename'] || `upload_${Date.now()}`,
      req.headers['content-type']
    );
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

// Setup file watcher
const watcher = chokidar.watch(uploadDir, {
  ignored: /(^|[\/\\])\../, // ignore dotfiles
  persistent: true
});

// Handle file changes
function notifyClients() {
  const data = JSON.stringify(getFileList());
  clients.forEach(client => {
    client.write(`data: ${data}\n\n`);
  });
}

// Watch for changes
watcher.on('add', notifyClients)
  .on('unlink', notifyClients)
  .on('change', notifyClients);

app.listen(PORT, () => {
  console.log(`🚀 Upload server running at http://localhost:${PORT}`);
});
