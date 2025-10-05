import React, { useState, useMemo } from 'react';
import { loadCandidates } from '../utils/storage';
import { Typography, Card, Tooltip, Empty } from 'antd'; 
import '../styles/Interviewer.css';

// Constants for the dark color palette
const { Title } = Typography; 

export default function Interviewer() {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('finalScore');
  const [filter, setFilter] = useState('all');

  const candidates = useMemo(() => {
    let cands = loadCandidates();

    // Filter
    if (filter === 'completed') cands = cands.filter(c => c.finalScore != null);
    else if (filter === 'inProgress') cands = cands.filter(c => c.finalScore == null);

    // Search
    if (search.trim()) {
      const s = search.toLowerCase();
      cands = cands.filter(c =>
        (c.name || '').toLowerCase().includes(s) || (c.email || '').toLowerCase().includes(s)
      );
    }

    // Sort
    cands = cands.slice().sort((a, b) => {
      if (sortKey === 'finalScore') return (b.finalScore || 0) - (a.finalScore || 0);
      if (sortKey === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortKey === 'createdAt') return new Date(b.createdAt) - new Date(a.createdAt);
      return 0;
    });

    return cands;
  }, [search, sortKey, filter]);

  return (
    <div className="interviewer-dashboard fade-in">
      <Title level={2} style={{color: '#E45A92'}}>Interviewer Dashboard 📊</Title>

      {/* Controls Bar */}
      <div className="controls-bar">
        <input
          type="text"
          placeholder="🔍 Search by name/email"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <select value={sortKey} onChange={e => setSortKey(e.target.value)}>
          <option value="finalScore">Sort by Score</option>
          <option value="name">Sort by Name</option>
          <option value="createdAt">Sort by Date</option>
        </select>
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="inProgress">In Progress</option>
        </select>
      </div>

      {/* Candidate List */}
      <div className="candidate-list">
        {candidates.length === 0 ? (
          <Empty description={<span style={{color: '#FFACAC'}}>No candidates found matching your criteria.</span>} />
        ) : (
          candidates.map(c => {
            const isCompleted = c.finalScore != null;
            const statusClass = isCompleted ? 'status-completed' : 'status-in-progress';
            const scoreText = c.finalScore ?? '—';

            return (
              <Card
                key={c.id}
                className="candidate-card"
                hoverable
              >
                <div className="card-header">
                  <div className="candidate-info">
                    <Tooltip title="Click to view details (functionality not implemented)">
                      <b onClick={() => console.log('View details for', c.id)}>{c.name || 'Untitled Candidate'}</b>
                    </Tooltip>
                    <span style={{color: '#FFACAC'}}> — {c.email}</span>
                    <div style={{ fontSize: 12, color: '#FFACAC', opacity: 0.7, marginTop: 4 }}>
                      Created: {new Date(c.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className={`status-badge ${statusClass}`}>
                      {isCompleted ? 'Completed' : 'In Progress'}
                    </span>
                    <span className="score-display">
                      Score: {scoreText}%
                    </span>
                  </div>
                </div>

                <details className="qa-details" style={{ marginTop: 10 }}>
                  <summary>View Questions & Answers ({c.answers?.length || 0})</summary>
                  <div style={{ marginTop: 6 }}>
                    {c.answers && c.answers.length > 0 ? (
                      c.answers.map((a, i) => (
                        <div key={i} className="qa-item">
                          <div><b style={{color: '#E45A92'}}>Q:</b> {a.questionText}</div>
                          <div><b style={{color: '#FFACAC'}}>A:</b> {a.responseText}</div>
                          <div style={{ color: '#aaa', marginTop: 4 }}>
                            <b>Score:</b> {a.score ?? '—'} | <b>Time:</b> {a.timeTakenSeconds}s
                            {a.autoSubmitted && <span className="auto-submitted"> (Auto Submitted)</span>}
                            <div style={{ marginTop: 4 }}><b>Feedback:</b> {a.feedback ?? '—'}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: '#FFACAC', padding: 8 }}>No answers recorded yet.</div>
                    )}
                  </div>
                </details>

                {c.summary && (
                  <div className="summary-box">
                    <b>Summary:</b> {c.summary}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}