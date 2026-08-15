import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Button, Spinner, Alert, Card } from 'react-bootstrap';
import PageHeader from '../components/PageHeader';

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
    <>
      <PageHeader
        breadcrumbs={['New Check']}
        title="Check URL Redirects"
        description="Upload a CSV or Excel file with from and to columns."
      />

      <Card className="app-card">
        <Card.Body>
          <Form onSubmit={handleSubmit}>
            <Form.Group>
              <Form.Label className="text-muted small text-uppercase">Spreadsheet</Form.Label>
              <Form.Control
                type="file"
                onChange={handleFileChange}
                accept=".csv,.xlsx"
                disabled={isUploading}
              />
              <Form.Text className="text-muted">
                Columns should be named <code>from</code> and <code>to</code>.
              </Form.Text>
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
        </Card.Body>
      </Card>
    </>
  );
}

export default UploadPage;
