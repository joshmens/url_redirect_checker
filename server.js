const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// Initialize express app and server
const app = express();

// TLS: terminated directly here with a Cloudflare Origin CA cert (Full
// strict mode), since the app no longer sits behind SWAG. Falls back to
// plain HTTP when no cert is configured (local dev).
const TLS_CERT_PATH = process.env.TLS_CERT_PATH;
const TLS_KEY_PATH = process.env.TLS_KEY_PATH;
const useTls = Boolean(TLS_CERT_PATH && TLS_KEY_PATH);
const server = useTls
  ? https.createServer({ cert: fs.readFileSync(TLS_CERT_PATH), key: fs.readFileSync(TLS_KEY_PATH) }, app)
  : http.createServer(app);

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

// Verify every request actually passed through Cloudflare Access, rather
// than trusting the Cf-Access-Authenticated-User-Email header on faith.
// Without a Tunnel, the origin has a real public IP (locked down to
// Cloudflare's IP ranges at the network level) - this is the
// defense-in-depth backstop so the app is still correct even if that
// network-level restriction were ever misconfigured. Skipped when unset
// (local dev).
const CF_ACCESS_TEAM_DOMAIN = process.env.CF_ACCESS_TEAM_DOMAIN;
const CF_ACCESS_AUD = process.env.CF_ACCESS_AUD;
const accessJwks = CF_ACCESS_TEAM_DOMAIN
  ? jwksClient({ jwksUri: `https://${CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs` })
  : null;

function getAccessSigningKey(header, callback) {
  accessJwks.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

function verifyAccessJwt(req, res, next) {
  if (!CF_ACCESS_TEAM_DOMAIN || !CF_ACCESS_AUD) return next();

  const token = req.headers['cf-access-jwt-assertion'];
  if (!token) {
    return res.status(401).json({ error: 'Missing Cloudflare Access assertion' });
  }
  jwt.verify(token, getAccessSigningKey, { audience: CF_ACCESS_AUD }, (err) => {
    if (err) {
      console.error('Access JWT verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid Cloudflare Access assertion' });
    }
    next();
  });
}

app.use(verifyAccessJwt);

// Strips headers that carry live, replayable credentials (session cookie,
// Access JWT) before they ever reach a log line.
function redactHeaders(headers) {
  const { cookie, authorization, 'cf-access-jwt-assertion': jwt, ...safe } = headers;
  return safe;
}

// Debug middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    headers: redactHeaders(req.headers),
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

// Who am I (identity comes from Cloudflare Access, injected as a header at the edge).
// Cloudflare Access never sits in front of a local run, so that header is
// never present here - fall back to a placeholder so the topbar's identity
// pill has something to render while developing/previewing locally. Same
// "unset CF_ACCESS_TEAM_DOMAIN means local dev" signal verifyAccessJwt()
// above already uses, so this never fires in production.
app.get('/api/whoami', (req, res) => {
  const email = req.headers['cf-access-authenticated-user-email']
    || (!CF_ACCESS_TEAM_DOMAIN ? 'local-dev@localhost' : null);
  res.json({ email });
});

// Database setup
const db = new sqlite3.Database('./database.sqlite');
db.serialize(() => {
  // Legacy table from before runs were tracked - left in place, no longer written to.
  db.run("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT)");

  db.run(`CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    user_email TEXT,
    filename TEXT,
    created_at TEXT,
    completed_at TEXT,
    status TEXT,
    total INTEGER,
    correct INTEGER,
    incorrect INTEGER,
    errors INTEGER,
    results TEXT
  )`);
});

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err); else resolve(this);
  });
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err); else resolve(row);
  });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err); else resolve(rows);
  });
});

// File upload setup
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

// Kicks off a new run: persists the run row and starts background processing,
// then responds with the runId so the client can navigate to its permalink.
async function startRun(req, res, urls, filename) {
  const userEmail = req.headers['cf-access-authenticated-user-email'] || 'unknown';
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await dbRun(
      `INSERT INTO runs (id, user_email, filename, created_at, completed_at, status, total, correct, incorrect, errors, results)
       VALUES (?, ?, ?, ?, NULL, 'running', ?, 0, 0, 0, NULL)`,
      [runId, userEmail, filename, now, urls.length]
    );
  } catch (error) {
    console.error('Failed to create run:', error);
    return res.status(500).json({ error: 'Failed to create run: ' + error.message });
  }

  processUrls(urls, io, runId);
  res.json({ runId, urlCount: urls.length });
}

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
      const records = parse(file.buffer.toString(), {
        columns: header => header.map(column => column.toLowerCase()),
        skip_empty_lines: true,
        trim: true
      });

      const urls = records
        .filter(record => record.from && record.to)
        .map(record => ({ from: record.from, to: record.to }));

      console.log(`CSV parsing complete. Found ${urls.length} valid URLs`);

      startRun(req, res, urls, file.originalname);
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

      startRun(req, res, urls, file.originalname);
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

// List all runs (metadata only), newest first
app.get('/api/runs', async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT id, user_email, filename, created_at, completed_at, status, total, correct, incorrect, errors
       FROM runs ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list runs: ' + error.message });
  }
});

// Full run detail, including results once complete
app.get('/api/runs/:id', async (req, res) => {
  try {
    const row = await dbGet('SELECT * FROM runs WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Run not found' });
    res.json({
      ...row,
      results: row.results ? JSON.parse(row.results) : []
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load run: ' + error.message });
  }
});

const EXPORT_COLUMNS = ['From', 'To', 'Actual', 'Status', 'HTTP Status', 'Note', 'Error', 'Error Type'];

function toRowObjects(results) {
  return results.map(r => ({
    'From': r.from || '',
    'To': r.to || '',
    'Actual': r.actual || '',
    'Status': r.status || '',
    'HTTP Status': r.statusCode || '',
    'Note': r.note || '',
    'Error': r.error || '',
    'Error Type': r.errorType || ''
  }));
}

function toCsv(results) {
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [EXPORT_COLUMNS.map(escape).join(',')];
  for (const row of toRowObjects(results)) {
    lines.push(EXPORT_COLUMNS.map(col => escape(row[col])).join(','));
  }
  return lines.join('\n');
}

async function loadCompletedRun(id, res) {
  const row = await dbGet('SELECT * FROM runs WHERE id = ?', [id]);
  if (!row) {
    res.status(404).json({ error: 'Run not found' });
    return null;
  }
  if (row.status !== 'complete') {
    res.status(409).json({ error: 'Run is still processing' });
    return null;
  }
  return row;
}

app.get('/api/runs/:id/export.csv', async (req, res) => {
  try {
    const row = await loadCompletedRun(req.params.id, res);
    if (!row) return;
    const csv = toCsv(JSON.parse(row.results || '[]'));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="run-${row.id}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export CSV: ' + error.message });
  }
});

app.get('/api/runs/:id/export.xlsx', async (req, res) => {
  try {
    const row = await loadCompletedRun(req.params.id, res);
    if (!row) return;
    const worksheet = XLSX.utils.json_to_sheet(toRowObjects(JSON.parse(row.results || '[]')));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="run-${row.id}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export XLSX: ' + error.message });
  }
});

// Processes URLs in batches, streaming progress to anyone who has joined the
// run's Socket.IO room (the uploader, plus anyone else viewing its permalink).
async function processUrls(urls, io, runId) {
  const results = [];
  const startTime = Date.now();
  const batchSize = 5;

  const normalizeUrl = (url) => {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      if (pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }
      return `${urlObj.origin}${pathname}${urlObj.search}${urlObj.hash}`.replace(/\/$/, '');
    } catch (e) {
      console.error('URL normalization error:', e);
      return url;
    }
  };

  console.log(`Starting to process ${urls.length} URLs for run ${runId}`);

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

    io.to(runId).emit('progress', {
      runId,
      progress: Math.min(progress, 100),
      remainingTime,
      currentBatch: Math.floor(i/batchSize) + 1,
      totalBatches: Math.ceil(urls.length/batchSize),
      processedCount: results.length,
      totalCount: urls.length,
      results: batchResults
    });

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('Processing complete for run:', runId);

  const summary = {
    total: results.length,
    correct: results.filter(r => r.status === 'correct').length,
    incorrect: results.filter(r => r.status === 'incorrect').length,
    errors: results.filter(r => r.status === 'error').length,
    timeouts: results.filter(r => r.status === 'error' && r.errorType === 'ETIMEDOUT').length
  };
  console.log('Results summary:', summary);

  try {
    await dbRun(
      `UPDATE runs SET status = 'complete', completed_at = ?, total = ?, correct = ?, incorrect = ?, errors = ?, results = ? WHERE id = ?`,
      [new Date().toISOString(), summary.total, summary.correct, summary.incorrect, summary.errors, JSON.stringify(results), runId]
    );
  } catch (error) {
    console.error('Failed to persist run results:', error);
  }

  io.to(runId).emit('complete', { runId, results, summary });
}

// Socket.IO Connection Handler - clients join a room per run to receive its
// live progress/complete events, whether they started the run or just opened its link.
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-run', ({ runId } = {}) => {
    if (runId) {
      socket.join(runId);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

app.use(express.static(path.join(__dirname, 'client/build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build/index.html'));
});

app.use((err, req, res, next) => {
  console.error('Global error handler:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    headers: redactHeaders(req.headers)
  });
  res.status(500).json({
    error: 'Server error',
    details: err.message,
    path: req.path
  });
});

const PORT = process.env.PORT || (useTls ? 443 : 5000);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} (${useTls ? 'https' : 'http'})`);
  console.log(`Serving static files from: ${path.join(__dirname, 'client/build')}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
