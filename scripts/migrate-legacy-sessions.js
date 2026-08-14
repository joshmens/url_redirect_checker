// One-off migration: copies rows from the old `sessions` table (raw JSON blobs,
// no user attribution) into the new `runs` table so they show up in the
// "Past Runs" list. Safe to re-run - existing `runs` rows are left alone.
//
// Usage: node scripts/migrate-legacy-sessions.js

const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err); else resolve(this);
  });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err); else resolve(rows);
  });
});

function summarize(results) {
  return {
    total: results.length,
    correct: results.filter(r => r.status === 'correct').length,
    incorrect: results.filter(r => r.status === 'incorrect').length,
    errors: results.filter(r => r.status === 'error').length
  };
}

async function main() {
  await dbRun("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT)");
  await dbRun(`CREATE TABLE IF NOT EXISTS runs (
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

  const rows = await dbAll('SELECT id, data FROM sessions');
  console.log(`Found ${rows.length} legacy session rows.`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    let results;
    try {
      results = JSON.parse(row.data);
      if (!Array.isArray(results)) throw new Error('data is not an array');
    } catch (error) {
      console.warn(`Skipping session ${row.id}: failed to parse data (${error.message})`);
      failed++;
      continue;
    }

    // Legacy ids are normally a Date.now().toString() timestamp. A handful of old,
    // buggy uploads produced non-numeric ids (e.g. "[object Object]") - give those
    // a fresh UUID instead of shipping a broken id as a permalink slug.
    const idAsNumber = parseInt(row.id, 10);
    const isCleanTimestampId = Number.isFinite(idAsNumber) && String(idAsNumber) === row.id;
    const runId = isCleanTimestampId ? row.id : crypto.randomUUID();
    const timestamp = isCleanTimestampId
      ? new Date(idAsNumber).toISOString()
      : new Date().toISOString();

    if (!isCleanTimestampId) {
      console.warn(`Session ${JSON.stringify(row.id)} has a malformed id, migrating as new run ${runId}`);
    }

    const summary = summarize(results);

    const result = await dbRun(
      `INSERT OR IGNORE INTO runs
        (id, user_email, filename, created_at, completed_at, status, total, correct, incorrect, errors, results)
       VALUES (?, 'unknown', 'legacy import', ?, ?, 'complete', ?, ?, ?, ?, ?)`,
      [runId, timestamp, timestamp, summary.total, summary.correct, summary.incorrect, summary.errors, row.data]
    );

    if (result.changes > 0) {
      migrated++;
    } else {
      skipped++;
    }
  }

  console.log(`Done. Migrated: ${migrated}, already present: ${skipped}, failed to parse: ${failed}.`);

  const [{ count: sessionsCount }] = await dbAll('SELECT COUNT(*) as count FROM sessions');
  console.log(`sessions table untouched, still has ${sessionsCount} rows.`);

  db.close();
}

main().catch(err => {
  console.error('Migration failed:', err);
  db.close();
  process.exit(1);
});
