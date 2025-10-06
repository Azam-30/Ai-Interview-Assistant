import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Card, Input, Button, Modal, Progress, List, Badge, Typography, message,
  Spin, Space, Tooltip, Row, Col
} from 'antd';
import {
  UserOutlined, MailOutlined, PhoneOutlined, FilePdfOutlined, FileWordOutlined,
  PlayCircleOutlined, PauseCircleOutlined, UploadOutlined, HistoryOutlined
} from '@ant-design/icons';
import { loadCandidates, saveCandidates } from '../utils/storage';
import '../styles/Interviewee.css';

const { Text, Title } = Typography;

const difficultySeconds = { easy: 20, medium: 60, hard: 120 };
// Determine backend base URL dynamically
const API_BASE =
  process.env.REACT_APP_API_BASE_URL ||
  (window.location.hostname === "localhost"
    ? "http://localhost:5050"
    : "https://ai-interview-assistant.vercel.app");




// Color palette
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
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fetchingQuestions, setFetchingQuestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Persist candidates
  useEffect(() => saveCandidates(candidates), [candidates]);

  // Resume unfinished
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

  // Immutable state update
  const updateCandidate = useCallback((id, updater) => {
    setCandidates(prev =>
      prev.map(c =>
        c.id === id
          ? (typeof updater === 'function' ? updater(c) : { ...c, ...updater })
          : c
      )
    );
  }, []);

  // Start timer
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
  }, [questions, currentIndex, active, updateCandidate, candidates]);

  useEffect(() => {
    if (questions.length && active != null) {
      const cand = candidates.find(c => c.id === active);
      if (!cand?.paused) startTimer();
    }
    return () => clearInterval(timerRef.current);
  }, [questions, currentIndex, active, startTimer, candidates]);

  // Pause/Resume
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

  // FIXED: Open candidate function - now takes candidates as parameter
  const openCandidate = useCallback(async (candidateId, resume = false, candidatesList = null) => {
    const currentCandidates = candidatesList || candidates;
    const cand = currentCandidates.find(c => c.id === candidateId);
    if (!cand) {
      console.error('Candidate not found:', candidateId);
      return;
    }

    setFetchingQuestions(true);
    setLoading(true);
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

      let rem = qs[idx] ? difficultySeconds[qs[idx].difficulty] : 0;
      if (cand.timer?.questionIndex === idx && typeof cand.timer.remaining === 'number') {
        const elapsed = Math.floor((Date.now() - cand.timer.lastUpdated) / 1000);
        rem = Math.max(0, cand.timer.remaining - elapsed);
      }
      setRemaining(rem);

      updateCandidate(candidateId, {
        timer: { questionIndex: idx, remaining: rem, lastUpdated: Date.now() },
        paused: false
      });
      setActive(candidateId);
    } catch (err) {
      message.error(err.message || 'Failed to fetch questions.');
    } finally {
      setLoading(false);
      setFetchingQuestions(false);
    }
  }, [candidates, updateCandidate]);

  const handleOpenCandidate = async (id, resume = true) => await openCandidate(id, resume);

  // FIXED: Upload resume - COMPLETELY rewritten to handle state properly
  const handleUploadFile = useCallback(async (e) => {
  console.log('🎯 handleUploadFile FUNCTION CALLED'); // DEBUG
  
  const file = e.target.files[0];
  console.log('📁 File selected:', file); // DEBUG
  console.log('📁 File name:', file?.name); // DEBUG
  console.log('📁 File type:', file?.type); // DEBUG
  console.log('📁 File size:', file?.size); // DEBUG
  
  if (!file) {
    console.log('❌ No file selected');
    return;
  }
  
  setUploading(true);
  try {
    console.log('🚀 Starting file upload...'); // DEBUG
    
    const fd = new FormData();
    fd.append('file', file);
    
    console.log('📤 Making API request to parse-resume...'); // DEBUG
    const res = await fetch('${API_BASE}/api/parse-resume', { 
      method: 'POST', 
      body: fd 
    });
    
    console.log('📥 API response status:', res.status); // DEBUG
    const data = await res.json();
    console.log('📥 API response data:', data); // DEBUG
    
    if (data.error) throw new Error(data.error);

    const id = 'c' + Date.now();
    const newCand = {
      id, 
      name: data.name || '', 
      email: data.email || '', 
      phone: data.phone || '', 
      resumeText: file.name,
      createdAt: new Date().toISOString(), 
      currentIndex: 0, 
      answers: [], 
      finalScore: null, 
      summary: null,
      timer: null, 
      paused: false, 
      questionsLength: 0, 
      questions: []
    };

    console.log('👤 New candidate created:', newCand); // DEBUG

    const missing = {};
    if (!newCand.name) missing.name = '';
    if (!newCand.email) missing.email = '';
    if (!newCand.phone) missing.phone = '';
    
    if (Object.keys(missing).length > 0) {
      console.log('📝 Missing fields detected, showing modal'); // DEBUG
      setCandidates(prev => [...prev, newCand]);
      setMissingFields({ ...missing, id });
      setShowModal(true);
      setActive(id);
    } else {
      console.log('✅ All fields present, starting interview immediately'); // DEBUG
      setCandidates(prev => {
        const updatedCandidates = [...prev, newCand];
        setTimeout(() => {
          openCandidate(id, false, updatedCandidates);
        }, 0);
        return updatedCandidates;
      });
      setActive(id);
    }
  } catch (err) {
    console.error('❌ Upload error:', err); // DEBUG
    message.error(err.message || 'Failed to upload resume.');
  } finally {
    console.log('🏁 Upload process completed'); // DEBUG
    setUploading(false);
    // Reset the file input
    e.target.value = '';
  }
}, [openCandidate]);

  // FIXED: Resume after modal
  const resumeAfterModal = useCallback(async () => {
    const id = active || missingFields.id;
    if (!id) {
      message.error('No candidate selected.');
      return;
    }
    
    // Update candidate with the filled fields
    updateCandidate(id, missingFields);
    setShowModal(false);
    
    // Start the interview immediately after modal closes
    await openCandidate(id, false);
  }, [active, missingFields, updateCandidate, openCandidate]);

  // Submit with proper loading states
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

    // Set submitting state for answer grading
    setSubmitting(true);

    try {
      const gradeRes = await fetch('${API_BASE}/api/grade-answer', {
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
      // Reset submitting state for next question
      setSubmitting(false);
      setCurrentIndex(nextIndex);
      const nextQ = questions[nextIndex];
      setRemaining(nextQ ? difficultySeconds[nextQ.difficulty] : 0);
      updateCandidate(active, {
        timer: {
          questionIndex: nextIndex,
          remaining: nextQ ? difficultySeconds[nextQ.difficulty] : 0,
          lastUpdated: Date.now()
        },
        paused: false
      });
    } else {
      // Last question - keep loading state for final summary
      try {
        const latest = loadCandidates().find(x => x.id === active) || cand;
        const finalRes = await fetch('${API_BASE}/api/final-summary', {
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
        message.success('Interview completed! Check your summary.');
      } catch {
        message.error('Interview finished but summary failed.');
      } finally {
        setSubmitting(false);
      }
    }
  }, [active, candidates, questions, currentIndex, answer, remaining, updateCandidate]);

  // Helpers
  const getTimerColor = useCallback(() => {
    const q = questions[currentIndex];
    if (!q) return COLOR_WARNING;
    const total = difficultySeconds[q.difficulty];
    if (remaining > total * 0.6) return COLOR_SAFE;
    if (remaining > total * 0.3) return COLOR_WARNING;
    return COLOR_DANGER;
  }, [questions, currentIndex, remaining]);

  const getFileIcon = useCallback((filename) => {
    if (!filename) return null;
    const lower = filename.toLowerCase();
    if (lower.endsWith('.pdf')) return <FilePdfOutlined style={{ color: COLOR_DANGER, marginRight: 4 }} />;
    if (lower.endsWith('.docx')) return <FileWordOutlined style={{ color: '#57c5f7', marginRight: 4 }} />;
    return null;
  }, []);

  // Get submit button text based on state
  const getSubmitButtonText = useCallback(() => {
    if (submitting) {
      if (currentIndex + 1 === questions.length) {
        return "Generating Final Summary...";
      }
      return "Submitting Answer...";
    }
    return "Submit Answer";
  }, [submitting, currentIndex, questions.length]);

  // Render
  const activeCandidate = active ? candidates.find(c => c.id === active) : null;

  return (
    <div className="interviewee-container">
      {fetchingQuestions && (
        <div className="overlay">
          <Spin size="large" tip={<span style={{ color: '#ffffff', fontSize: '1.1rem' }}>Generating interview questions... 🤖</span>} />
        </div>
      )}

      <div className="left-panel">
        <Title level={3} style={{ marginBottom: 16, color: '#FFACAC' }}>Start Your Interview 🚀</Title>

<Spin spinning={uploading} tip="Parsing resume...">
  <div style={{ marginBottom: 20, textAlign: 'center' }}>
    {/* Simple visible file input - NO HIDDEN INPUTS */}
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
          title={<Title level={4} style={{color: COLOR_WARNING}}>👤 Complete Your Profile</Title>}
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
            <Text style={{color: '#FFACAC'}}>Please ensure all required fields are filled to begin.</Text>
            {missingFields.name !== undefined && <Input prefix={<UserOutlined />} placeholder="Name" value={missingFields.name} onChange={e => setMissingFields(prev => ({ ...prev, name: e.target.value }))} autoFocus />}
            {missingFields.email !== undefined && <Input prefix={<MailOutlined />} placeholder="Email" value={missingFields.email} onChange={e => setMissingFields(prev => ({ ...prev, email: e.target.value }))} type="email" />}
            {missingFields.phone !== undefined && <Input prefix={<PhoneOutlined />} placeholder="Phone" value={missingFields.phone} onChange={e => setMissingFields(prev => ({ ...prev, phone: e.target.value }))} type="tel" />}
          </Space>
        </Modal>

        {active && !showModal ? (
          activeCandidate?.finalScore != null ? (
            <Card className="summary-card">
              <Title level={4} style={{ color: COLOR_WARNING }}>Interview Summary</Title>
              <p><strong>Score:</strong> {activeCandidate.finalScore}%</p>
              <p>{activeCandidate.summary}</p>
              <Button
                type="primary"
                onClick={() => { setActive(null); setQuestions([]); setCurrentIndex(0); setRemaining(0); setAnswer(''); }}
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
                      <Tooltip title={`Time limit for a ${questions[currentIndex].difficulty} question`}>
                        <Badge color={getTimerColor()} text={questions[currentIndex].difficulty.toUpperCase()} />
                      </Tooltip>
                    )}
                  </div>
                }
                className="question-card"
              >
                <div className="timer-row">
                  <Badge count={`${remaining}s`} style={{ backgroundColor: getTimerColor(), fontSize: 18, minWidth: 50 }} />
                  <div style={{ marginLeft: 16 }}>
                    <Button size="middle" icon={<PauseCircleOutlined />} onClick={pauseActive} disabled={activeCandidate?.paused || submitting} style={{ marginRight: 8, color: COLOR_WARNING, borderColor: COLOR_WARNING }}>Pause</Button>
                    <Button size="middle" icon={<PlayCircleOutlined />} onClick={resumeActive} disabled={!activeCandidate?.paused || submitting} style={{ color: COLOR_WARNING, borderColor: COLOR_WARNING }}>Resume</Button>
                  </div>
                </div>

                <Text strong className="question-text">{questions[currentIndex]?.text || 'Loading question...'}</Text>

                <Input.TextArea
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  rows={6}
                  className="answer-textarea"
                  disabled={remaining <= 0 || activeCandidate?.paused || submitting}
                  placeholder="Type your answer here..."
                  autoFocus
                />
                <Button 
                  type="primary" 
                  onClick={() => handleSubmit(false)} 
                  disabled={!answer.trim() || remaining <= 0 || submitting || activeCandidate?.paused} 
                  className="submit-btn" 
                  danger={remaining <= 10 && remaining > 0}
                  loading={submitting}
                >
                  {getSubmitButtonText()}
                </Button>
                <Progress
                  percent={((currentIndex + 1) / questions.length) * 100}
                  strokeColor={{ '0%': COLOR_SAFE, '50%': COLOR_WARNING, '100%': COLOR_DANGER }}
                  strokeWidth={10}
                  showInfo={false}
                  className="progress-bar"
                />
              </Card>
            )
          )
        ) : (
          <Text type="secondary" className="no-active-text">
            No active interview. Upload your resume above to start a new session, or select an existing session from the right panel.
          </Text>
        )}
      </div>

      <div className="right-panel">
        <Title level={4} style={{color: '#E45A92'}}><HistoryOutlined /> Past Sessions</Title>
        <List
          dataSource={candidates.slice().reverse()}
          locale={{ emptyText: <Text style={{color: '#FFACAC'}}>No candidates yet</Text> }}
          renderItem={c => (
            <List.Item style={{ padding: 0 }}>
              <Card
                size="small"
                title={<span style={{color: '#FFACAC'}}>{getFileIcon(c.resumeText)}{c.name || 'Untitled Candidate'}</span>}
                className="candidate-card"
                hoverable
              >
                <Row gutter={[8, 8]}>
                  <Col span={24}><Text style={{color: '#FFACAC', opacity: 0.8}} ellipsis>{c.email || 'No email'}</Text></Col>
                  <Col span={24}>
                    <Badge
                      color={c.finalScore != null ? COLOR_WARNING : '#5D2F77'}
                      text={<span style={{color: '#ffffff'}}>Score: {c.finalScore ?? 'In progress'}</span>}
                    />
                  </Col>
                  <Col span={24} style={{ marginTop: 8 }}>
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => handleOpenCandidate(c.id)}
                      style={{ marginRight: 8, backgroundColor: COLOR_WARNING, borderColor: COLOR_WARNING, color: COLOR_ACCENT_DARK }}
                    >
                      {c.finalScore != null ? 'View' : 'Resume/Open'}
                    </Button>
                    <Tooltip title="View object in console for debugging">
                      <Button size="small" onClick={() => console.log(c)} style={{color: '#FFACAC', borderColor: '#FFACAC'}}>View Data</Button>
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