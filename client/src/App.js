import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Container, Navbar, Nav, Form } from 'react-bootstrap';
import UploadPage from './pages/UploadPage';
import RunDetailPage from './pages/RunDetailPage';
import RunsListPage from './pages/RunsListPage';

function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [email, setEmail] = useState(null);

  useEffect(() => {
    fetch('/api/whoami')
      .then(res => res.json())
      .then(data => setEmail(data.email))
      .catch(() => setEmail(null));
  }, []);

  return (
    <BrowserRouter>
      <div data-bs-theme={darkMode ? 'dark' : 'light'} className={darkMode ? 'bg-dark text-light min-vh-100' : 'min-vh-100'}>
        <Navbar bg={darkMode ? 'dark' : 'light'} variant={darkMode ? 'dark' : 'light'} expand="md" className="mb-3">
          <Container>
            <Navbar.Brand as={NavLink} to="/">URL Redirect Checker</Navbar.Brand>
            <Navbar.Toggle aria-controls="main-nav" />
            <Navbar.Collapse id="main-nav">
              <Nav className="me-auto">
                <Nav.Link as={NavLink} to="/" end>New Check</Nav.Link>
                <Nav.Link as={NavLink} to="/runs">Past Runs</Nav.Link>
              </Nav>
              <Nav className="align-items-center">
                {email && <Navbar.Text className="me-3">Signed in as {email}</Navbar.Text>}
                <Form.Check
                  type="switch"
                  id="dark-mode-switch"
                  label="Dark Mode"
                  checked={darkMode}
                  onChange={() => setDarkMode(!darkMode)}
                />
              </Nav>
            </Navbar.Collapse>
          </Container>
        </Navbar>

        <Container>
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/runs" element={<RunsListPage darkMode={darkMode} />} />
            <Route path="/runs/:id" element={<RunDetailPage darkMode={darkMode} />} />
          </Routes>
        </Container>
      </div>
    </BrowserRouter>
  );
}

export default App;
