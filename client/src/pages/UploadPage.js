import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Form, Button, Spinner, Alert } from 'react-bootstrap';

function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(true);
    setError('');

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        setError(data.error || 'Upload failed');
        setIsUploading(false);
        return;
      }

      navigate(`/runs/${data.runId}`);
    } catch (err) {
      setError(`Network error: ${err.message}`);
      setIsUploading(false);
    }
  };

  return (
    <Row className="my-3">
      <Col>
        <h1>Check URL Redirects</h1>
        <p className="text-muted">
          Upload a CSV or Excel file with <code>from</code> and <code>to</code> columns.
        </p>
        <Form onSubmit={handleSubmit}>
          <Form.Group>
            <Form.Control
              type="file"
              onChange={handleFileChange}
              accept=".csv,.xlsx"
              disabled={isUploading}
            />
          </Form.Group>
          {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
          <Button
            variant="primary"
            type="submit"
            disabled={!file || isUploading}
            className="mt-3"
          >
            {isUploading ? (
              <>
                <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" />
                Uploading...
              </>
            ) : 'Start Checking'}
          </Button>
        </Form>
      </Col>
    </Row>
  );
}

export default UploadPage;
