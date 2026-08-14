import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Row, Col, Table, ProgressBar, Spinner, Alert, Button, Form } from 'react-bootstrap';
import socket from '../socket';

function RunDetailPage({ darkMode }) {
  const { id } = useParams();
  const [run, setRun] = useState(null);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | running | complete | not-found | error
  const [progress, setProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [copied, setCopied] = useState(false);

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
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  if (status === 'loading') {
    return (
      <Row className="my-3">
        <Col><Spinner animation="border" /></Col>
      </Row>
    );
  }

  if (status === 'not-found') {
    return (
      <Row className="my-3">
        <Col><Alert variant="danger">Run not found.</Alert></Col>
      </Row>
    );
  }

  if (status === 'error') {
    return (
      <Row className="my-3">
        <Col><Alert variant="danger">Failed to load this run.</Alert></Col>
      </Row>
    );
  }

  return (
    <>
      <Row className="my-3">
        <Col>
          <h1>Run Details</h1>
          <div className="text-muted mb-2">
            {run.filename} &middot; started by {run.user_email} &middot; {new Date(run.created_at).toLocaleString()}
          </div>
          <div className="d-flex align-items-center gap-2 mb-2">
            <Form.Control readOnly value={window.location.href} size="sm" style={{ maxWidth: '420px' }} />
            <Button size="sm" variant="outline-secondary" onClick={handleCopyLink}>
              {copied ? 'Copied!' : 'Copy Link'}
            </Button>
          </div>
          {status === 'complete' && (
            <div>
              <Button size="sm" variant="outline-primary" href={`/api/runs/${id}/export.csv`} className="me-2">
                Export CSV
              </Button>
              <Button size="sm" variant="outline-primary" href={`/api/runs/${id}/export.xlsx`}>
                Export Excel
              </Button>
            </div>
          )}
        </Col>
      </Row>

      {status === 'running' && (
        <Row className="my-3">
          <Col>
            <div className="d-flex align-items-center mb-2">
              <Spinner animation="border" variant="primary" className="me-2" size="sm" />
              <span>Processing...</span>
            </div>
            <ProgressBar now={progress} label={`${progress.toFixed(0)}%`} animated striped />
            <div className="mt-2 text-muted">
              <small>Processed: {processedCount}/{totalCount} URLs</small>
            </div>
          </Col>
        </Row>
      )}

      {status === 'complete' && (
        <Row className="my-3">
          <Col>
            <div className={`p-3 rounded ${darkMode ? 'bg-secondary' : 'bg-light'}`}>
              <h4>Summary</h4>
              <div>
                Total URLs: {run.total}
                <br />
                Correct: {run.correct}
                <br />
                Incorrect: {run.incorrect}
                <br />
                Errors: {run.errors}
              </div>
            </div>
          </Col>
        </Row>
      )}

      <Row className="my-3">
        <Col>
          <Table striped bordered hover variant={darkMode ? 'dark' : 'light'} responsive>
            <thead>
              <tr>
                <th>From URL</th>
                <th>To URL</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center">No results yet</td>
                </tr>
              ) : (
                results.map((result, index) => (
                  <tr key={index} className={
                    result.status === 'correct' ? 'table-success' :
                    result.status === 'incorrect' ? 'table-danger' :
                    'table-warning'
                  }>
                    <td>{result.from}</td>
                    <td>{result.to}</td>
                    <td>{result.status}</td>
                    <td>
                      {result.status === 'correct' ? (
                        <>
                          Redirected correctly
                          {result.note && <small className="d-block text-muted mt-1">{result.note}</small>}
                        </>
                      ) :
                       result.status === 'incorrect' ? `Redirected to ${result.actual}` :
                       `Error: ${result.error}${result.errorType ? ` (${result.errorType})` : ''}`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Col>
      </Row>
    </>
  );
}

export default RunDetailPage;
