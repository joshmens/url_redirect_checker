const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parse');
const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client/build')));

const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT)");
});

const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  let urls = [];

  if (file.mimetype === 'text/csv') {
    csv(file.buffer.toString(), {
      columns: true,
      skip_empty_lines: true
    })
      .on('data', (data) => {
        urls.push({ from: data.from, to: data.to });
      })
      .on('end', () => {
        processUrls(urls, req.socket);
      });
  } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    urls = data.map(row => ({ from: row.from, to: row.to }));
    processUrls(urls, req.socket);
  }

  res.json({ message: 'File uploaded successfully' });
});

async function processUrls(urls, socket) {
  const sessionId = Date.now().toString();
  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const response = await axios.get(url.from, { maxRedirects: 5 });
      const isCorrect = response.request.res.responseUrl === url.to;
      results.push({
        from: url.from,
        to: url.to,
        actual: response.request.res.responseUrl,
        status: isCorrect ? 'correct' : 'incorrect',
        statusCode: response.status
      });
    } catch (error) {
      results.push({
        from: url.from,
        to: url.to,
        status: 'error',
        error: error.message
      });
    }

    const progress = ((i + 1) / urls.length) * 100;
    const elapsedTime = (Date.now() - startTime) / 1000;
    const estimatedTotalTime = (elapsedTime / progress) * 100;
    const remainingTime = estimatedTotalTime - elapsedTime;

    socket.emit('progress', {
      progress,
      remainingTime: Math.round(remainingTime),
      result: results[i]
    });
  }

  db.run("INSERT INTO sessions (id, data) VALUES (?, ?)", [sessionId, JSON.stringify(results)]);

  socket.emit('complete', { sessionId, results });
}

app.get('/api/session/:id', (req, res) => {
  const { id } = req.params;
  db.get("SELECT data FROM sessions WHERE id = ?", [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: 'Database error' });
    } else if (row) {
      res.json(JSON.parse(row.data));
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));