import React from 'react';

/**
 * A <th> that toggles ascending/descending sort on click and shows
 * a small arrow indicator when it's the active sort column.
 */
function SortableHeader({ label, sortKey, currentSort, currentDir, onSort, className = '' }) {
  const isActive = currentSort === sortKey;

  return (
    <th
      tabIndex={0}
      onClick={() => onSort(sortKey)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSort(sortKey);
        }
      }}
      className={`user-select-none ${className}`}
      style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
      aria-sort={isActive ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      <span className="ms-1 text-muted">
        {isActive ? (currentDir === 'asc' ? '▲' : '▼') : ''}
      </span>
    </th>
  );
}

export default SortableHeader;
