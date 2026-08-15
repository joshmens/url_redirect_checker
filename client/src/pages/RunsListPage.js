import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Table, Spinner, Alert, Badge, Button, Card } from 'react-bootstrap';
import SortableHeader from '../components/SortableHeader';
import StatusPill, { VARIANT_BY_STATUS } from '../components/StatusPill';
import PageHeader from '../components/PageHeader';

// Matches the `status` values actually stored on the `runs` table (see server.js).
const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running' },
  { key: 'complete', label: 'Complete' },
];

function RunsListPage() {
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    fetch('/api/runs')
      .then(res => res.json())
      .then(setRuns)
      .catch(() => setError('Failed to load past runs.'));
  }, []);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(dir => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const visibleRuns = useMemo(() => {
    if (!runs) return [];

    const filtered = statusFilter === 'all'
      ? runs
      : runs.filter(run => run.status === statusFilter);

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
  }, [runs, statusFilter, sortKey, sortDir]);

  return (
    <>
      <PageHeader breadcrumbs={['Past Runs']} title="Past Runs" />

      {error && <Alert variant="danger">{error}</Alert>}

      {!error && !runs && (
        <Card className="app-card">
          <Card.Body className="text-center py-5">
            <Spinner animation="border" />
          </Card.Body>
        </Card>
      )}

      {!error && runs && (
        <Card className="app-card">
          <Card.Body>
            <span className="app-filter-label">Filter by status</span>
            <div className="app-chip-group mb-3">
              {STATUS_FILTERS.map(({ key, label }) => {
                const statusVariant = VARIANT_BY_STATUS[key];
                const isActive = statusFilter === key;
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
                    onClick={() => setStatusFilter(key)}
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
                    <SortableHeader label="Date" sortKey="created_at" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="User" sortKey="user_email" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Filename" sortKey="filename" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Total" sortKey="total" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Correct" sortKey="correct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Incorrect" sortKey="incorrect" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Errors" sortKey="errors" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {runs.length === 0 ? (
                    <tr><td colSpan="8" className="text-center text-muted py-4">No runs yet</td></tr>
                  ) : visibleRuns.length === 0 ? (
                    <tr><td colSpan="8" className="text-center text-muted py-4">No runs match this filter</td></tr>
                  ) : (
                    visibleRuns.map(run => (
                      <tr key={run.id}>
                        <td style={{ overflowWrap: 'break-word' }}>
                          <Link to={`/runs/${run.id}`}>{new Date(run.created_at).toLocaleString()}</Link>
                        </td>
                        <td style={{ overflowWrap: 'break-word' }}>{run.user_email}</td>
                        <td style={{ overflowWrap: 'break-word' }}>{run.filename}</td>
                        <td>
                          <StatusPill status={run.status} />
                        </td>
                        <td>{run.total}</td>
                        <td><Badge bg="success">{run.correct}</Badge></td>
                        <td><Badge bg="danger">{run.incorrect}</Badge></td>
                        <td><Badge bg="warning" text="dark">{run.errors}</Badge></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </div>
          </Card.Body>
        </Card>
      )}
    </>
  );
}

export default RunsListPage;
