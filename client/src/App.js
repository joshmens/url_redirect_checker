import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button, Table, ProgressBar, Spinner } from 'react-bootstrap';
import { Pie } from 'react-chartjs-2';
import io from 'socket.io-client';

const socket = io();

function App() {
  const [file, setFile] = useState(null);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    socket.on('progress', (data) => {
      setProgress(data.progress);
      setRemainingTime(data.remainingTime);
      setResults(prevResults => [...prevResults, data.result]);
    });

    socket.on('complete', (data) => {
      setIsProcessing(false);
      // Handle completion, maybe save session ID
    });

    return () => {
      socket.off('progress');
      socket.off('complete');
    };
  }, []);

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsProcessing(true);
    setResults([]);
    setProgress(0);

    try {
      await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
    } catch (error) {
      console.error('Error:', error);
      setIsProcessing(false);
    }
  };

  const chartData = {
    labels: ['Correct', 'Incorrect', 'Error'],
    datasets: [{
      data: [
        results.filter(r => r.status === 'correct').length,
        results.filter(r => r.status === 'incorrect').length,
        results.filter(r => r.status === 'error').length
      ],
      backgroundColor: ['#28a745', '#dc3545', '#ffc107']
    }]
  };

  return (
    <Container className={darkMode ? 'bg-dark text-light' : ''}>
      <Row className="my-3">
        <Col>
          <h1>URL Redirect Checker</h1>
          <Form onSubmit={handleSubmit}>
            <Form.Group>
              <Form.File 
                id="fileUpload" 
                label="Upload CSV or Excel file" 
                onChange={handleFileChange}
                accept=".csv,.xlsx"
              />
            </Form.Group>
            <Button variant="primary" type="submit" disabled={!file || isProcessing}>
              {isProcessing ? 'Processing...' : 'Start Checking'}
            </Button>
          </Form>
        </Col>
      </Row>

      {isProcessing && (
        <Row className="my-3">
          <Col>
            <ProgressBar now={progress} label={`${progress.toFixed(2)}%`} />
            <p>Estimated time remaining: {remainingTime} seconds</p>
          </Col>
        </Row>
      )}

      <Row className="my-3">
        <Col md={8}>
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
              {results.map((result, index) => (
                <tr key={index} className={result.status === 'correct' ? 'table-success' : result.status === 'incorrect' ? 'table-danger' : 'table-warning'}>
                  <td>{result.from}</td>
                  <td>{result.to}</td>
                  <td>{result.status}</td>
                  <td>
                    {result.status === 'correct' ? 'Redirected correctly' :
                     result.status === 'incorrect' ? `Redirected to ${result.actual}` :
                     result.error}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Col>
        <Col md={4}>
          <Pie data={chartData} />
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