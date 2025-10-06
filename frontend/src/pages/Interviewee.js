import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card, Input, Button, Modal, Progress, List, Badge, Typography, message,
  Spin, Space, Tooltip, Row, Col
} from 'antd';
import {
  UserOutlined, MailOutlined, PhoneOutlined, FilePdfOutlined, FileWordOutlined,
  PlayCircleOutlined, PauseCircleOutlined, HistoryOutlined
} from '@ant-design/icons';
import { loadCandidates, saveCandidates } from '../utils/storage';
import '../styles/Interviewee.css';

const { Text, Title } = Typography;
const difficultySeconds = { easy: 20, medium: 60, hard: 120 };

// 🔗 Dynamic backend base URL
const API_BASE =
  process.env.REACT_APP_API_BASE_URL ||
  (window.location.hostname === "localhost"
    ? "http://localhost:5050"
    : "https://ai-interview-backend.vercel.app"); // Change to your backend deploy URL

// 🎨 Color palette
const COLOR_SAFE = '#FFACAC';
const COLOR_WARNING = '#E45A92';
const COLOR_DANGER = '#f5222d';
const COLOR_ACCENT_DARK = '#3E1E68';

export default function Interviewee() {
  const [candidates, setCandidates] = useState(() => loadCandidates());
  const [active, setActive] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [answer, setAnswer] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [missingFields, setMissingFields] = useState({});
  const [uploading, setUploading] = useState(false);
  const [fetchingQuestions, setFetchingQuestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef(null);

  // 🔄 Persist candidates
  useEffect(() => saveCandidates(candidates), [candidates]);

  // 🔁 Resume unfinished interview
  useEffect(() => {
    if (active) return;
    const unfinished = candidates.find(c => c.answers.length < (c.questionsLength || 0) && !c.finalScore);
    if (unfinished) {
      Modal.confirm({
        title: `Welcome back${unfinished.name ? ', ' + unfinished.name : ''}!`,
        content: 'You have an unfinished interview. Resume now?',
        onOk: () => handleOpenCandidate(unfinished.id, true),
        okText: 'Resume',
        cancelText: 'Later'
      });
    }
  }, []); // eslint-disable-line

  // 🔧 Update candidate immutably
  const updateCandidate = useCallback((id, updater) => {
    setCandidates(prev =>
      prev.map(c =>
        c.id === id
          ? (typeof updater === 'function' ? updater(c) : { ...c, ...updater })
          : c
      )
    );
  }, []);

  // ⏱ Start timer
  const startTimer = useCallback(() => {
    clearInterval(timerRef.current);
    const q = questions[currentIndex];
    if (!q || !active) return;

    const cand = candidates.find(c => c.id === active);
    const initialRemaining = cand?.timer?.remaining ?? difficultySeconds[q.difficulty];
    setRemaining(initialRemaining);

    timerRef.current = setInterval(() => {
      setRemaining(prev => {
        const next = prev - 1;
        updateCandidate(active, c => ({
          ...c,
          timer: { questionIndex: currentIndex, remaining: Math.max(0, next), lastUpdated: Date.now() }
        }));
        if (next <= 0) {
          clearInterval(timerRef.current);
          handleSubmit(true);
          return 0;
        }
        return next;
      });
    }, 1000);
  }, [questions, currentIndex, active, updateCandidate]);

  // 🎮 Pause/Resume
  const pauseActive = () => {
    if (!active) return;
    clearInterval(timerRef.current);
    updateCandidate(active, c => ({
      ...c,
      paused: true,
      timer: { ...(c.timer || {}), remaining, lastUpdated: Date.now() }
    }));
    message.info('Interview paused.');
  };

  const resumeActive = () => {
    if (!active) return;
    updateCandidate(active, c => ({
      ...c,
      paused: false,
      timer: { ...(c.timer || {}), lastUpdated: Date.now() }
    }));
    startTimer();
    message.success('Interview resumed!');
  };

  // 🎯 Open candidate
  const openCandidate = useCallback(async (candidateId, resume = false, candidatesList = null) => {
    const currentCandidates = candidatesList || candidates;
    const cand = currentCandidates.find(c => c.id === candidateId);
    if (!cand) return;

    setFetchingQuestions(true);
    try {
      let qs = cand.questions || [];
      if (!qs.length) {
        const res = await fetch(`${API_BASE}/api/generate-questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'Full Stack Developer', stack: ['React', 'Node.js'] })
        });
        const data = await res.json();
        if (!data.questions || data.questions.length !== 6) throw new Error('Backend must return exactly 6 questions.');
        qs = data.questions;
        updateCandidate(candidateId, { questions: qs, questionsLength: qs.length });
      }
      setQuestions(qs);

      const idx = resume ? (cand.currentIndex || cand.answers.length || 0) : 0;
      setCurrentIndex(Math.min(idx, qs.length - 1));

      const nextQ = qs[idx];
      const rem = nextQ ? difficultySeconds[nextQ.difficulty] : 0;
      setRemaining(rem);
      setActive(candidateId);
    } catch (err) {
      message.error(err.message || 'Failed to fetch questions.');
    } finally {
      setFetchingQuestions(false);
    }
  }, [candidates, updateCandidate]);

  const handleOpenCandidate = async (id, resume = true) => await openCandidate(id, resume);

  // 📤 Upload resume
  const handleUploadFile = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);

    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch(`${API_BASE}/api/parse-resume`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const id = 'c' + Date.now();
      const newCand = {
        id, name: data.name || '', email: data.email || '', phone: data.phone || '',
        resumeText: file.name, createdAt: new Date().toISOString(),
        currentIndex: 0, answers: [], finalScore: null, summary: null,
        timer: null, paused: false, questionsLength: 0, questions: []
      };

      const missing = {};
      if (!newCand.name) missing.name = '';
      if (!newCand.email) missing.email = '';
      if (!newCand.phone) missing.phone = '';

      if (Object.keys(missing).length > 0) {
        setCandidates(prev => [...prev, newCand]);
        setMissingFields({ ...missing, id });
        setShowModal(true);
        setActive(id);
      } else {
        setCandidates(prev => {
          const updated = [...prev, newCand];
          setTimeout(() => openCandidate(id, false, updated), 0);
          return updated;
        });
        setActive(id);
      }
    } catch (err) {
      message.error(err.message || 'Failed to upload resume.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }, [openCandidate]);

  // 🧾 Resume after filling modal
  const resumeAfterModal = useCallback(async () => {
    const id = active || missingFields.id;
    if (!id) {
      message.error('No candidate selected.');
      return;
    }
    updateCandidate(id, missingFields);
    setShowModal(false);
    await openCandidate(id, false);
  }, [active, missingFields, updateCandidate, openCandidate]);

  // 📝 Submit answer
  const handleSubmit = useCallback(async (auto = false) => {
    if (!active) return;
    const cand = candidates.find(c => c.id === active);
    if (!cand) return;

    clearInterval(timerRef.current);
    const q = questions[currentIndex];
    if (!q) return;

    const responseText = (!answer.trim() && auto) ? '[AUTO SUBMITTED]' : answer;
    const timeTaken = difficultySeconds[q.difficulty] - remaining;

    const newAnswer = {
      questionId: q.id, questionText: q.text, difficulty: q.difficulty,
      responseText, timeTakenSeconds: timeTaken, autoSubmitted: auto, score: null, feedback: null
    };

    updateCandidate(active, c => ({
      ...c,
      answers: [...c.answers, newAnswer],
      currentIndex: c.currentIndex + 1,
      timer: null
    }));
    setAnswer('');
    setSubmitting(true);

    try {
      const gradeRes = await fetch(`${API_BASE}/api/grade-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q.text, answer: responseText })
      });
      const grade = await gradeRes.json();

      updateCandidate(active, c => {
        const a = [...c.answers];
        a[a.length - 1] = { ...a[a.length - 1], score: grade.score, feedback: grade.feedback };
        return { ...c, answers: a };
      });
    } catch {
      message.warning('Error grading answer.');
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex < questions.length) {
      setSubmitting(false);
      setCurrentIndex(nextIndex);
      setRemaining(difficultySeconds[questions[nextIndex].difficulty]);
    } else {
      try {
        const latest = loadCandidates().find(x => x.id === active) || cand;
        const finalRes = await fetch(`${API_BASE}/api/final-summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate: latest })
        });
        const finalData = await finalRes.json();
        updateCandidate(active, {
          finalScore: finalData.finalScorePercent,
          summary: finalData.summary,
          currentIndex: questions.length
        });
        message.success('Interview completed!');
      } catch {
        message.error('Interview finished but summary failed.');
      } finally {
        setSubmitting(false);
      }
    }
  }, [active, candidates, questions, currentIndex, answer, remaining, updateCandidate]);

  // 🟢 Helpers
  const getTimerColor = () => {
    const q = questions[currentIndex];
    if (!q) return COLOR_WARNING;
    const total = difficultySeconds[q.difficulty];
    if (remaining > total * 0.6) return COLOR_SAFE;
    if (remaining > total * 0.3) return COLOR_WARNING;
    return COLOR_DANGER;
  };

  const getFileIcon = (filename) => {
    if (!filename) return null;
    const lower = filename.toLowerCase();
    if (lower.endsWith('.pdf')) return <FilePdfOutlined style={{ color: COLOR_DANGER, marginRight: 4 }} />;
    if (lower.endsWith('.docx')) return <FileWordOutlined style={{ color: '#57c5f7', marginRight: 4 }} />;
    return null;
  };

  const activeCandidate = active ? candidates.find(c => c.id === active) : null;

  // 🖥 Render
  return (
    <div className="interviewee-container">
      {fetchingQuestions && (
        <div className="overlay">
          <Spin size="large" tip={<span style={{ color: '#fff', fontSize: '1.1rem' }}>Generating questions... 🤖</span>} />
        </div>
      )}

      <div className="left-panel">
        <Title level={3} style={{ marginBottom: 16, color: '#FFACAC' }}>Start Your Interview 🚀</Title>

        <Spin spinning={uploading} tip="Parsing resume...">
          <div style={{ marginBottom: 20, textAlign: 'center' }}>
            <input
              type="file"
              accept=".pdf,.docx"
              onChange={handleUploadFile}
              style={{
                width: '100%',
                padding: '12px',
                border: `2px dashed ${COLOR_WARNING}`,
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 172, 172, 0.1)',
                color: '#FFACAC',
                fontSize: '16px',
                cursor: 'pointer'
              }}
              disabled={uploading}
            />
            <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: '12px' }}>
              Select your PDF or DOCX resume file
            </Text>
          </div>
        </Spin>

        <Modal
          title={<Title level={4} style={{ color: COLOR_WARNING }}>👤 Complete Your Profile</Title>}
          open={showModal}
          onOk={resumeAfterModal}
          okText="Start Interview"
          onCancel={() => setShowModal(false)}
          maskClosable={false}
          destroyOnClose
          okButtonProps={{ style: { backgroundColor: COLOR_WARNING, borderColor: COLOR_WARNING, color: COLOR_ACCENT_DARK } }}
          cancelButtonProps={{ style: { color: COLOR_WARNING } }}
        >
          <Space direction="vertical" style={{ width: '100%', padding: '10px 0' }}>
            <Text style={{ color: '#FFACAC' }}>Please fill all required fields.</Text>
            {missingFields.name !== undefined && <Input prefix={<UserOutlined />} placeholder="Name" value={missingFields.name} onChange={e => setMissingFields(prev => ({ ...prev, name: e.target.value }))} />}
            {missingFields.email !== undefined && <Input prefix={<MailOutlined />} placeholder="Email" value={missingFields.email} onChange={e => setMissingFields(prev => ({ ...prev, email: e.target.value }))} />}
            {missingFields.phone !== undefined && <Input prefix={<PhoneOutlined />} placeholder="Phone" value={missingFields.phone} onChange={e => setMissingFields(prev => ({ ...prev, phone: e.target.value }))} />}
          </Space>
        </Modal>

        {/* Main Question & Summary */}
        {active && !showModal ? (
          activeCandidate?.finalScore != null ? (
            <Card className="summary-card">
              <Title level={4} style={{ color: COLOR_WARNING }}>Interview Summary</Title>
              <p><strong>Score:</strong> {activeCandidate.finalScore}%</p>
              <p>{activeCandidate.summary}</p>
              <Button
                type="primary"
                onClick={() => { setActive(null); setQuestions([]); }}
              >
                Close Interview
              </Button>
            </Card>
          ) : (
            questions.length > 0 && questions[currentIndex] && (
              <Card
                title={
                  <div className="question-header">
                    <span>Question {currentIndex + 1} / {questions.length}</span>
                    {questions[currentIndex] && (
                      <Tooltip title={`Time limit for ${questions[currentIndex].difficulty}`}>
                        <Badge color={getTimerColor()} text={questions[currentIndex].difficulty.toUpperCase()} />
                      </Tooltip>
                    )}
                  </div>
                }
                className="question-card"
              >
                <div className="timer-row">
                  <Badge count={`${remaining}s`} style={{ backgroundColor: getTimerColor(), fontSize: 18 }} />
                  <div style={{ marginLeft: 16 }}>
                    <Button icon={<PauseCircleOutlined />} onClick={pauseActive} disabled={activeCandidate?.paused || submitting} style={{ marginRight: 8, color: COLOR_WARNING, borderColor: COLOR_WARNING }}>Pause</Button>
                    <Button icon={<PlayCircleOutlined />} onClick={resumeActive} disabled={!activeCandidate?.paused || submitting} style={{ color: COLOR_WARNING, borderColor: COLOR_WARNING }}>Resume</Button>
                  </div>
                </div>

                <Text strong>{questions[currentIndex]?.text}</Text>

                <Input.TextArea
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  rows={6}
                  disabled={remaining <= 0 || activeCandidate?.paused || submitting}
                  placeholder="Type your answer here..."
                />
                <Button 
                  type="primary" 
                  onClick={() => handleSubmit(false)} 
                  disabled={!answer.trim() || remaining <= 0 || submitting} 
                  className="submit-btn" 
                  loading={submitting}
                >
                  {submitting ? "Submitting..." : "Submit Answer"}
                </Button>

                <Progress
                  percent={((currentIndex + 1) / questions.length) * 100}
                  strokeColor={{ '0%': COLOR_SAFE, '50%': COLOR_WARNING, '100%': COLOR_DANGER }}
                  showInfo={false}
                />
              </Card>
            )
          )
        ) : (
          <Text type="secondary">No active interview. Upload resume to start.</Text>
        )}
      </div>

      <div className="right-panel">
        <Title level={4} style={{ color: '#E45A92' }}><HistoryOutlined /> Past Sessions</Title>
        <List
          dataSource={candidates.slice().reverse()}
          locale={{ emptyText: <Text style={{ color: '#FFACAC' }}>No candidates yet</Text> }}
          renderItem={c => (
            <List.Item>
              <Card
                size="small"
                title={<span style={{ color: '#FFACAC' }}>{getFileIcon(c.resumeText)}{c.name || 'Untitled Candidate'}</span>}
                className="candidate-card"
                hoverable
              >
                <Row gutter={[8, 8]}>
                  <Col span={24}><Text style={{ color: '#FFACAC', opacity: 0.8 }}>{c.email || 'No email'}</Text></Col>
                  <Col span={24}>
                    <Badge
                      color={c.finalScore != null ? COLOR_WARNING : '#5D2F77'}
                      text={<span style={{ color: '#ffffff' }}>Score: {c.finalScore ?? 'In progress'}</span>}
                    />
                  </Col>
                  <Col span={24} style={{ marginTop: 8 }}>
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => handleOpenCandidate(c.id)}
                      style={{ backgroundColor: COLOR_WARNING, borderColor: COLOR_WARNING, color: COLOR_ACCENT_DARK }}
                    >
                      {c.finalScore != null ? 'View' : 'Resume/Open'}
                    </Button>
                    <Tooltip title="View object in console">
                      <Button size="small" onClick={() => console.log(c)} style={{ color: '#FFACAC', borderColor: '#FFACAC' }}>View Data</Button>
                    </Tooltip>
                  </Col>
                </Row>
              </Card>
            </List.Item>
          )}
        />
      </div>
    </div>
  );
}
