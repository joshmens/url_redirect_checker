import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Nav, Form, Offcanvas } from 'react-bootstrap';
import UploadPage from './pages/UploadPage';
import RunDetailPage from './pages/RunDetailPage';
import RunsListPage from './pages/RunsListPage';

const NAV_ITEMS = [
  { to: '/', end: true, label: 'New Check', icon: '➕' },
  { to: '/runs', end: false, label: 'Past Runs', icon: '⏱' },
];

function SidebarNav({ onNavigate }) {
  return (
    <Nav className="flex-column">
      {NAV_ITEMS.map((item) => (
        <Nav.Link
          key={item.to}
          as={NavLink}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className="app-sidebar-link"
        >
          <span className="app-sidebar-icon" aria-hidden="true">{item.icon}</span>
          {item.label}
        </Nav.Link>
      ))}
    </Nav>
  );
}

function SidebarBrand() {
  return (
    <div className="app-sidebar-brand">
      <span className="app-sidebar-brand-mark">URL</span>
      <span>Redirect Checker</span>
    </div>
  );
}

function SidebarFooter({ email, darkMode, onToggleDarkMode }) {
  return (
    <div className="app-sidebar-footer">
      {email && (
        <div className="app-sidebar-user" title={email}>
          <span className="app-sidebar-user-label">Signed in as</span>
          <span className="app-sidebar-user-email">{email}</span>
        </div>
      )}
      <div className="app-sidebar-toggle">
        <span className="app-sidebar-icon" aria-hidden="true">{darkMode ? '🌙' : '☀️'}</span>
        <Form.Check
          type="switch"
          id="dark-mode-switch"
          label="Dark Mode"
          checked={darkMode}
          onChange={onToggleDarkMode}
          className="app-sidebar-switch"
        />
      </div>
    </div>
  );
}

function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [email, setEmail] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch('/api/whoami')
      .then(res => res.json())
      .then(data => setEmail(data.email))
      .catch(() => setEmail(null));
  }, []);

  return (
    <BrowserRouter>
      <div data-bs-theme={darkMode ? 'dark' : 'light'} className="app-shell">
        <aside className="app-sidebar d-none d-md-flex flex-column">
          <SidebarBrand />
          <SidebarNav />
          <SidebarFooter
            email={email}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode(!darkMode)}
          />
        </aside>

        <Offcanvas
          show={sidebarOpen}
          onHide={() => setSidebarOpen(false)}
          className="app-sidebar-offcanvas d-md-none"
        >
          <Offcanvas.Header closeButton>
            <Offcanvas.Title>
              <SidebarBrand />
            </Offcanvas.Title>
          </Offcanvas.Header>
          <Offcanvas.Body className="d-flex flex-column">
            <SidebarNav onNavigate={() => setSidebarOpen(false)} />
            <SidebarFooter
              email={email}
              darkMode={darkMode}
              onToggleDarkMode={() => setDarkMode(!darkMode)}
            />
          </Offcanvas.Body>
        </Offcanvas>

        <div className="app-main">
          <header className="app-topbar d-md-none">
            <button
              type="button"
              className="app-topbar-toggle"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              <span />
              <span />
              <span />
            </button>
          </header>

          <main className="app-content">
            <Routes>
              <Route path="/" element={<UploadPage />} />
              <Route path="/runs" element={<RunsListPage />} />
              <Route path="/runs/:id" element={<RunDetailPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
