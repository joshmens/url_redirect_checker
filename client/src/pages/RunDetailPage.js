import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Table, ProgressBar, Spinner, Alert, Button, Form, Badge, Card } from 'react-bootstrap';
import socket from '../socket';
import SortableHeader from '../components/SortableHeader';
import StatusPill, { VARIANT_BY_STATUS } from '../components/StatusPill';
import PageHeader from '../components/PageHeader';

// navigator.clipboard is only defined in secure contexts (HTTPS, or
// http://localhost) - it is undefined over plain http://<lan-ip>, which is
// exactly how this app is often previewed. `navigator.clipboard?.writeText()`
// silently short-circuits the *entire* optional-chain expression (including
// any chained `.then()`) to `undefined` in that case - no exception, no
// rejected promise, nothing to catch. So we can't rely on try/catch around
// the modern API alone; we need to detect the missing API up front and fall
// back to the legacy `document.execCommand('copy')` approach, which works
// over plain HTTP.
function legacyCopyToClipboard(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  // Keep it in the viewport (some browsers refuse to focus/select
  // off-screen elements) but visually and interactively inert.
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.padding = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let succeeded = false;
  try {
    succeeded = document.execCommand('copy');
  } catch (err) {
    succeeded = false;
  }
  document.body.removeChild(textarea);
  return succeeded;
}

// Simple check for whether a string is an absolute http(s) URL - used to
// decide whether to render the Details column's content (which is mostly
// free text, e.g. "Redirected correctly" or an error message, but embeds a
// URL via result.actual for incorrect rows) as a clickable link.
function isUrlLike(text) {
  return typeof text === 'string' && /^https?:\/\//i.test(text);
}

// Matches the per-URL `status` values set by the worker (see server.js checkUrl()).
const RESULT_STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'correct', label: 'Correct' },
  { key: 'incorrect', label: 'Incorrect' },
  { key: 'error', label: 'Error' },
];

const ROW_STATUS_CLASS = {
  correct: 'row-status-success',
  incorrect: 'row-status-danger',
  error: 'row-status-warning',
};

function RunDetailPage() {
  const { id } = useParams();
  const [run, setRun] = useState(null);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | running | complete | not-found | error
  const [progress, setProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [resultStatusFilter, setResultStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(dir => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const visibleResults = useMemo(() => {
    const filtered = resultStatusFilter === 'all'
      ? results
      : results.filter(r => r.status === resultStatusFilter);

    if (!sortKey) return filtered;

    return [...filtered].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av == null) av = '';
      if (bv == null) bv = '';
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [results, resultStatusFilter, sortKey, sortDir]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    fetch(`/api/runs/${id}`)
      .then(res => {
        if (res.status === 404) {
          if (!cancelled) setStatus('not-found');
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (!data || cancelled) return;
        setRun(data);
        setResults(data.results || []);
        setTotalCount(data.total || 0);
        setProcessedCount(data.status === 'complete' ? data.total : 0);
        setProgress(data.status === 'complete' ? 100 : 0);
        setStatus(data.status);
      })
      .catch(() => { if (!cancelled) setStatus('error'); });

    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (status !== 'running') return;

    socket.emit('join-run', { runId: id });

    const onProgress = (data) => {
      if (data.runId !== id) return;
      setProgress(data.progress);
      setProcessedCount(data.processedCount);
      setTotalCount(data.totalCount);
      setResults(prev => {
        const next = [...prev];
        data.results.forEach(r => {
          if (!next.find(x => x.from === r.from)) next.push(r);
        });
        return next;
      });
    };

    const onComplete = (data) => {
      if (data.runId !== id) return;
      setResults(data.results);
      setProgress(100);
      setStatus('complete');
      setRun(prev => (prev ? { ...prev, ...data.summary, status: 'complete' } : prev));
    };

    socket.on('progress', onProgress);
    socket.on('complete', onComplete);

    return () => {
      socket.off('progress', onProgress);
      socket.off('complete', onComplete);
    };
  }, [status, id]);

  const handleCopyLink = useCallback(() => {
    const url = window.location.href;
    const onSuccess = () => {
      setCopyFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    const onFailure = () => {
      setCopied(false);
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 2000);
    };

    // window.isSecureContext (and, equivalently, navigator.clipboard being
    // defined) is false for plain http:// origins other than localhost -
    // e.g. previewing over a LAN IP like http://192.168.1.15:5000. Detect
    // that up front rather than relying on a .catch(), since the modern API
    // short-circuits to `undefined` (no rejected promise) when unavailable.
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(onSuccess).catch(() => {
        if (legacyCopyToClipboard(url)) onSuccess();
        else onFailure();
      });
    } else if (legacyCopyToClipboard(url)) {
      onSuccess();
    } else {
      onFailure();
    }
  }, []);

  if (status === 'loading') {
    return (
      <Card className="app-card">
        <Card.Body className="text-center py-5">
          <Spinner animation="border" />
        </Card.Body>
      </Card>
    );
  }

  if (status === 'not-found') {
    return <Alert variant="danger">Run not found.</Alert>;
  }

  if (status === 'error') {
    return <Alert variant="danger">Failed to load this run.</Alert>;
  }

  return (
    <>
      <PageHeader breadcrumbs={['Past Runs', 'Run Detail']} title="Run Details" />

      <Card className="app-card mb-3">
        <Card.Body>
          <div className="text-muted mb-2">
            {run.filename} &middot; started by {run.user_email} &middot; {new Date(run.created_at).toLocaleString()}
          </div>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <Form.Control readOnly value={window.location.href} size="sm" style={{ maxWidth: '420px' }} />
            <Button
              size="sm"
              variant={copied ? 'success' : copyFailed ? 'danger' : 'outline-secondary'}
              onClick={handleCopyLink}
              aria-live="polite"
            >
              {copied ? (
                <>
                  <span aria-hidden="true">&#10003;</span> Copied!
                </>
              ) : copyFailed ? (
                <>
                  <span aria-hidden="true">&#10007;</span> Copy failed
                </>
              ) : (
                'Copy Link'
              )}
            </Button>
            {status === 'complete' && (
              <>
                <Button size="sm" variant="outline-primary" href={`/api/runs/${id}/export.csv`}>
                  Export CSV
                </Button>
                <Button size="sm" variant="outline-primary" href={`/api/runs/${id}/export.xlsx`}>
                  Export Excel
                </Button>
              </>
            )}
          </div>
        </Card.Body>
      </Card>

      {status === 'running' && (
        <Card className="app-card mb-3">
          <Card.Body>
            <div className="d-flex align-items-center mb-2">
              <Spinner animation="border" variant="primary" className="me-2" size="sm" />
              <span>Processing...</span>
            </div>
            <ProgressBar now={progress} label={`${progress.toFixed(0)}%`} animated striped />
            <div className="mt-2 text-muted">
              <small>Processed: {processedCount}/{totalCount} URLs</small>
            </div>
          </Card.Body>
        </Card>
      )}

      {status === 'complete' && (
        <Card className="app-card mb-3">
          <Card.Body>
            <h4 className="app-card-title">Summary</h4>
            <div className="d-flex flex-wrap align-items-center gap-3">
              <span>Total: {run.total}</span>
              <span>Correct: <Badge bg="success">{run.correct}</Badge></span>
              <span>Incorrect: <Badge bg="danger">{run.incorrect}</Badge></span>
              <span>Errors: <Badge bg="warning" text="dark">{run.errors}</Badge></span>
            </div>
          </Card.Body>
        </Card>
      )}

      <Card className="app-card">
        <Card.Body>
          <span className="app-filter-label">Filter by status</span>
          <div className="app-chip-group mb-3">
            {RESULT_STATUS_FILTERS.map(({ key, label }) => {
              const statusVariant = VARIANT_BY_STATUS[key];
              const isActive = resultStatusFilter === key;
              const chipClass = [
                'app-chip',
                statusVariant ? `app-chip-status app-chip-${statusVariant}` : '',
                isActive ? 'app-chip-active' : '',
              ].filter(Boolean).join(' ');
              return (
                <Button
                  key={key}
                  size="sm"
                  className={chipClass}
                  variant={isActive ? 'primary' : 'outline-secondary'}
                  aria-pressed={isActive}
                  onClick={() => setResultStatusFilter(key)}
                >
                  {label}
                </Button>
              );
            })}
          </div>

          <div className="table-responsive">
            <Table hover responsive className="app-table">
              <thead>
                <tr>
                  <SortableHeader label="From URL" sortKey="from" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="To URL" sortKey="to" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center text-muted py-4">No results yet</td>
                  </tr>
                ) : visibleResults.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center text-muted py-4">No results match this filter</td>
                  </tr>
                ) : (
                  visibleResults.map((result, index) => (
                    <tr key={index} className={ROW_STATUS_CLASS[result.status] || ''}>
                      <td style={{ overflowWrap: 'anywhere' }}>
                        <a href={result.from} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: 'anywhere' }}>{result.from}</a>
                      </td>
                      <td style={{ overflowWrap: 'anywhere' }}>
                        <a href={result.to} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: 'anywhere' }}>{result.to}</a>
                      </td>
                      <td>
                        <StatusPill status={result.status} />
                      </td>
                      <td style={{ overflowWrap: 'break-word' }}>
                        {result.status === 'correct' ? (
                          <>
                            Redirected correctly
                            {result.note && <small className="d-block text-muted mt-1">{result.note}</small>}
                          </>
                        ) :
                         result.status === 'incorrect' ? (
                           <>
                             Redirected to{' '}
                             {isUrlLike(result.actual) ? (
                               <a href={result.actual} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: 'anywhere' }}>{result.actual}</a>
                             ) : result.actual}
                           </>
                         ) :
                         `Error: ${result.error}${result.errorType ? ` (${result.errorType})` : ''}`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
        </Card.Body>
      </Card>
    </>
  );
}

export default RunDetailPage;
