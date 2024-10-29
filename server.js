const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { parse } = require('csv-parse/sync'); // Updated import
const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

// Initialize express app and server
const app = express();
const server = http.createServer(app);

// Socket.IO setup with more specific configuration
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? 'https://urlchecker.nzweb.dev'
      : 'http://localhost:3000',
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors());
app.use(express.json());

// Debug middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    headers: req.headers,
    query: req.query,
    body: req.body
  });
  next();
});

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ test: 'ok', timestamp: new Date().toISOString() });
});

// Database setup
const db = new sqlite3.Database('./database.sqlite');
db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT)");
});

// File upload setup
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  console.log('Upload received at:', new Date().toISOString());
  
  if (!req.file) {
    console.error('No file received');
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const file = req.file;
  console.log('File details:', {
    filename: file.originalname,
    size: file.size,
    mimetype: file.mimetype
  });

  if (file.mimetype === 'text/csv') {
    try {
      console.log('CSV content:', file.buffer.toString().substring(0, 500)); // Debug log
      
      const records = parse(file.buffer.toString(), {
        columns: header => header.map(column => column.toLowerCase()), // Convert headers to lowercase
        skip_empty_lines: true,
        trim: true
      });
      
      console.log('First parsed record:', records[0]); // Debug log
      
      const urls = records
        .filter(record => record.from && record.to)
        .map(record => ({ from: record.from, to: record.to }));

      console.log(`CSV parsing complete. Found ${urls.length} valid URLs`);
      console.log('First few URLs:', urls.slice(0, 2)); // Debug log
      
      processUrls(urls, io);
      res.json({ message: 'File uploaded successfully', urlCount: urls.length });
    } catch (error) {
      console.error('CSV processing error:', error);
      res.status(500).json({ error: 'Failed to process CSV: ' + error.message });
    }
  } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      const urls = data.map(row => ({ from: row.from, to: row.to }));
      console.log(`Excel parsing complete. Found ${urls.length} valid URLs`);
      processUrls(urls, io);
      res.json({ message: 'File uploaded successfully', urlCount: urls.length });
    } catch (error) {
      console.error('Excel parsing error:', error);
      res.status(500).json({ error: 'Failed to process Excel: ' + error.message });
    }
  } else {
    res.status(400).json({ 
      error: 'Invalid file type',
      received: file.mimetype,
      allowed: ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    });
  }
});

async function processUrls(urls, socket) {
  const sessionId = Date.now().toString();
  const results = [];
  const startTime = Date.now();
  const batchSize = 5;

  // Helper function to normalize URLs for comparison
  const normalizeUrl = (url) => {
    try {
      const urlObj = new URL(url);
      // Always remove trailing slash from pathname
      let pathname = urlObj.pathname;
      if (pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }
      // Reconstruct URL without trailing slash
      return `${urlObj.origin}${pathname}${urlObj.search}${urlObj.hash}`.replace(/\/$/, '');
    } catch (e) {
      console.error('URL normalization error:', e);
      return url;
    }
  };

  console.log(`Starting to process ${urls.length} URLs at ${new Date().toISOString()}`);

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    console.log(`Processing batch ${i/batchSize + 1} of ${Math.ceil(urls.length/batchSize)}`);

    const batchPromises = batch.map(async (url, batchIndex) => {
      try {
        console.log(`Checking URL (${i + batchIndex + 1}/${urls.length}):`, url.from);
        const response = await axios.get(url.from, { 
          maxRedirects: 5,
          timeout: 30000,
          validateStatus: function (status) {
            return status >= 200 && status < 400;
          }
        });
        
        const normalizedActual = normalizeUrl(response.request.res.responseUrl);
        const normalizedExpected = normalizeUrl(url.to);
        const isCorrect = normalizedActual === normalizedExpected;
        const onlyTrailingSlashDiff = normalizedActual.replace(/\/$/, '') === normalizedExpected.replace(/\/$/, '');

        return {
          from: url.from,
          to: url.to,
          actual: response.request.res.responseUrl,
          status: isCorrect || onlyTrailingSlashDiff ? 'correct' : 'incorrect',
          statusCode: response.status,
          // Add note about trailing slash if that was the only difference
          note: onlyTrailingSlashDiff && !isCorrect ? 'Matches except for trailing slash' : undefined
        };
      } catch (error) {
        console.error(`Error processing ${url.from}:`, error.message);
        return {
          from: url.from,
          to: url.to,
          status: 'error',
          error: error.message,
          errorType: error.code
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    const progress = ((i + batch.length) / urls.length) * 100;
    const elapsedTime = (Date.now() - startTime) / 1000;
    const estimatedTotalTime = (elapsedTime / progress) * 100;
    const remainingTime = Math.round(estimatedTotalTime - elapsedTime);

    io.emit('progress', {
      progress: Math.min(progress, 100),
      remainingTime,
      currentBatch: Math.floor(i/batchSize) + 1,
      totalBatches: Math.ceil(urls.length/batchSize),
      processedCount: results.length,
      totalCount: urls.length,
      results: batchResults
    });

    // Add a small delay between batches
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('Processing complete at:', new Date().toISOString());
  
  // Log summary of results
  const summary = {
    total: results.length,
    correct: results.filter(r => r.status === 'correct').length,
    incorrect: results.filter(r => r.status === 'incorrect').length,
    errors: results.filter(r => r.status === 'error').length,
    timeouts: results.filter(r => r.status === 'error' && r.errorType === 'ETIMEDOUT').length
  };
  console.log('Results summary:', summary);

  db.run("INSERT INTO sessions (id, data) VALUES (?, ?)", [sessionId, JSON.stringify(results)]);
  io.emit('complete', { sessionId, results, summary });
}

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// IMPORTANT: API routes must be before static file serving
app.use(express.static(path.join(__dirname, 'client/build')));

// React app catch-all route - LAST route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build/index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    headers: req.headers
  });
  res.status(500).json({ 
    error: 'Server error', 
    details: err.message,
    path: req.path
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Serving static files from: ${path.join(__dirname, 'client/build')}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});