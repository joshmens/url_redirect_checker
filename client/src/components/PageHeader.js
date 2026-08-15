import React from 'react';

/**
 * Breadcrumb-style page header used at the top of each page's content area.
 * `breadcrumbs` is an ordered list of trail labels, e.g. ['Past Runs', 'Run Detail'].
 */
function PageHeader({ breadcrumbs, title, description, actions }) {
  return (
    <div className="app-page-header">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="breadcrumb" className="app-breadcrumb">
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb}>
              {index > 0 && <span className="app-breadcrumb-sep">/</span>}
              <span>{crumb}</span>
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="app-page-header-row">
        <div>
          <h1 className="app-page-title">{title}</h1>
          {description && <p className="app-page-description">{description}</p>}
        </div>
        {actions && <div className="app-page-header-actions">{actions}</div>}
      </div>
    </div>
  );
}

export default PageHeader;
