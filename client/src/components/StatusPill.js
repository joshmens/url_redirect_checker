import React from 'react';

// Maps the various `status` values used across runs (running/complete) and
// per-URL results (correct/incorrect/error) to a soft pill color variant.
// Exported so other components (e.g. the status filter chips on
// RunsListPage/RunDetailPage) can reuse the exact same status -> color
// mapping instead of re-deriving it and risking drift.
export const VARIANT_BY_STATUS = {
  running: 'info',
  complete: 'secondary',
  correct: 'success',
  incorrect: 'danger',
  error: 'warning',
};

function StatusPill({ status, label }) {
  const variant = VARIANT_BY_STATUS[status] || 'secondary';
  return <span className={`status-pill status-pill-${variant}`}>{label || status}</span>;
}

export default StatusPill;
