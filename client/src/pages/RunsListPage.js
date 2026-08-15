import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Row, Col, Table, Spinner, Alert, Badge } from 'react-bootstrap';

function RunsListPage({ darkMode }) {
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/runs')
      .then(res => res.json())
      .then(setRuns)
      .catch(() => setError('Failed to load past runs.'));
  }, []);

  if (error) {
    return <Row className="my-3"><Col><Alert variant="danger">{error}</Alert></Col></Row>;
  }
  if (!runs) {
    return <Row className="my-3"><Col><Spinner animation="border" /></Col></Row>;
  }

  return (
    <Row className="my-3">
      <Col>
        <h1>Past Runs</h1>
        <Table striped bordered hover variant={darkMode ? 'dark' : 'light'} responsive>
          <thead>
            <tr>
              <th>Date</th>
              <th>User</th>
              <th>Filename</th>
              <th>Status</th>
              <th>Total</th>
              <th>Correct</th>
              <th>Incorrect</th>
              <th>Errors</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr><td colSpan="8" className="text-center">No runs yet</td></tr>
            ) : (
              runs.map(run => (
                <tr key={run.id}>
                  <td><Link to={`/runs/${run.id}`}>{new Date(run.created_at).toLocaleString()}</Link></td>
                  <td>{run.user_email}</td>
                  <td>{run.filename}</td>
                  <td>
                    {run.status === 'running'
                      ? <Badge bg="info">running</Badge>
                      : <Badge bg="secondary">complete</Badge>}
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
      </Col>
    </Row>
  );
}

export default RunsListPage;
