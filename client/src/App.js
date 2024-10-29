import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button, Table, ProgressBar, Spinner } from 'react-bootstrap';
import io from 'socket.io-client';

function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [file, setFile] = useState(null);
  const [results, setResults] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  
  const [socket] = useState(() => io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    secure: true,
    rejectUnauthorized: false,
    withCredentials: true
  }));

  useEffect(() => {
    // Socket connection status
    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setUploadStatus('Connection error. Please try again.');
    });

    // Process updates
    socket.on('progress', (data) => {
      console.log('Progress update:', data);
      setProgress(data.progress);
      setProcessedCount(data.processedCount);
      setTotalCount(data.totalCount);
      
      setResults(prevResults => {
        const newResults = [...prevResults];
        data.results.forEach(result => {
          if (!newResults.find(r => r.from === result.from)) {
            newResults.push(result);
          }
        });
        return newResults;
      });
    });

    socket.on('complete', (data) => {
      console.log('Process complete:', data);
      setIsProcessing(false);
      setUploadStatus('Processing complete!');
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('progress');
      socket.off('complete');
    };
  }, [socket]);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    console.log('Selected file:', {
      name: selectedFile?.name,
      type: selectedFile?.type,
      size: selectedFile?.size
    });
    setFile(selectedFile);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsProcessing(true);
    setResults([]);
    setProgress(0);
    setUploadStatus('Uploading file...');

    try {
      console.log('Sending file:', {
        name: file.name,
        type: file.type,
        size: file.size
      });

      for (let pair of formData.entries()) {
        console.log('FormData contains:', pair[0], pair[1]);
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
        headers: {
          'Accept': 'application/json',
        }
      });

      console.log('Response headers:', {
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(response.headers.entries())
      });

      const text = await response.text();
      console.log('Complete response text:', text);

      if (response.status === 500) {
        setUploadStatus('Server error. Check console for details.');
        setIsProcessing(false);
        return;
      }

      try {
        const data = JSON.parse(text);
        console.log('Parsed response:', data);

        if (data.error) {
          setUploadStatus(`Error: ${data.error}`);
          setIsProcessing(false);
        } else {
          setTotalCount(data.urlCount);
          setUploadStatus(`Processing ${data.urlCount} URLs...`);
        }
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        console.error('Failed to parse text:', text.substring(0, 500));
        setUploadStatus('Error: Server returned invalid response');
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('Network error:', error);
      setUploadStatus(`Error: ${error.message}`);
      setIsProcessing(false);
    }
  };

  return (
    <Container className={darkMode ? 'bg-dark text-light' : ''}>
      <Row className="my-3">
        <Col>
          <h1>URL Redirect Checker</h1>
          <Form onSubmit={handleSubmit}>
            <Form.Group>
              <Form.Control 
                type="file" 
                onChange={handleFileChange}
                accept=".csv,.xlsx"
                disabled={isProcessing}
              />
            </Form.Group>
            <Button 
              variant="primary" 
              type="submit" 
              disabled={!file || isProcessing} 
              className="mt-3"
            >
              {isProcessing ? (
                <>
                  <Spinner
                    as="span"
                    animation="border"
                    size="sm"
                    role="status"
                    aria-hidden="true"
                    className="me-2"
                  />
                  Processing...
                </>
              ) : 'Start Checking'}
            </Button>
          </Form>
        </Col>
      </Row>

      {isProcessing && (
        <Row className="my-3">
          <Col>
            <div className="d-flex align-items-center mb-2">
              <Spinner
                animation="border"
                variant="primary"
                className="me-2"
                size="sm"
              />
              <span>{uploadStatus}</span>
            </div>
            
            <ProgressBar 
              now={progress} 
              label={`${progress.toFixed(2)}%`}
              animated
              striped
            />
            
            <div className="mt-2 text-muted">
              <small>
                Processed: {processedCount}/{totalCount} URLs
              </small>
            </div>
          </Col>
        </Row>
      )}

      {!isProcessing && results.length > 0 && (
        <Row className="my-3">
          <Col>
            <div className="p-3 bg-light rounded">
              <h4>Summary</h4>
              <div>
                Total URLs: {results.length}
                <br />
                Correct: {results.filter(r => r.status === 'correct').length}
                <br />
                Incorrect: {results.filter(r => r.status === 'incorrect').length}
                <br />
                Errors: {results.filter(r => r.status === 'error').length}
                {results.filter(r => r.status === 'error' && r.errorType === 'ETIMEDOUT').length > 0 && (
                  <>
                    <br />
                    Timeouts: {results.filter(r => r.status === 'error' && r.errorType === 'ETIMEDOUT').length}
                  </>
                )}
              </div>
            </div>
          </Col>
        </Row>
      )}

      <Row className="my-3">
        <Col>
          <Table striped bordered hover variant={darkMode ? 'dark' : 'light'}>
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

      <Row className="my-3">
        <Col>
          <Form.Check 
            type="switch"
            id="dark-mode-switch"
            label="Dark Mode"
            checked={darkMode}
            onChange={() => setDarkMode(!darkMode)}
          />
        </Col>
      </Row>
    </Container>
  );
}

export default App;