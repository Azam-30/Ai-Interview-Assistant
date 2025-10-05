// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

// Gemini AI SDK
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

const upload = multer({ dest: path.join(__dirname, 'uploads/') });
const app = express();
app.use(cors());
app.use(express.json());

console.log('✅ Express app initialized');

// ----------------- Helper Functions -----------------

// Safe JSON extractor (handles extra text, Markdown, etc.)
function extractJSON(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (innerErr) {
        console.error("⚠️ Regex JSON parse failed:", innerErr.message);
        return null;
      }
    }
    console.error("⚠️ No JSON found in text:", text);
    return null;
  }
}

// Resume field extractors
function extractEmail(text) {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/);
  return m ? m[0] : null;
}
function extractPhone(text) {
  const m = text.match(/(\+?\d{1,3}[\s-]?)?(\d{10}|\d{3}[\s-]\d{3}[\s-]\d{4})/);
  return m ? m[0] : null;
}
function extractName(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < Math.min(6, lines.length); i++) {
    const s = lines[i];
    if (!/resume/i.test(s) && /[A-Za-z]/.test(s) && s.split(' ').length <= 4) return s;
  }
  return null;
}

// ----------------- Routes -----------------

// 1) Resume Parsing
app.post('/api/parse-resume', upload.single('file'), async (req, res) => {
  console.log('📄 Received request: /api/parse-resume');
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    let text = '';

    if (ext === '.pdf') {
      try {
        const data = fs.readFileSync(req.file.path);
        const pdf = await pdfParse(data);
        text = pdf.text || '';
      } catch (pdfErr) {
        console.error('❌ PDF parse error:', pdfErr.message);
        return res.status(400).json({ error: 'Failed to parse PDF. Try another file.' });
      }
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: req.file.path });
      text = result.value || '';
    } else {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Only PDF or DOCX allowed' });
    }

    const name = extractName(text);
    const email = extractEmail(text);
    const phone = extractPhone(text);

    try { fs.unlinkSync(req.file.path); } catch (e) {}

    console.log('✅ Extracted fields:', { name, email, phone });
    res.json({ name, email, phone, text });
  } catch (err) {
    console.error('❌ Resume parsing error:', err.message);
    res.status(500).json({ error: 'Failed to parse resume' });
  }
});

// 2) Generate Questions (AI)
app.post('/api/generate-questions', async (req, res) => {
  console.log('🤖 Received request: /api/generate-questions');
  try {
    const role = req.body.role || 'Full Stack Developer';
    const stack = req.body.stack || ['React', 'Node.js'];

    const prompt = `
      You are an AI interview assistant.
      Generate 6 technical interview questions for a ${role} role
      with skills in ${stack.join(', ')}.
      Rules:
      - First 2 questions: Easy
      - Next 2 questions: Medium
      - Last 2 questions: Hard
      - Return output strictly as JSON array of objects:
        [{"id":"q1","difficulty":"easy","text":"..."}, ...]
    `;

    const result = await model.generateContent(prompt);
    const questions = extractJSON(result.response.text());

    if (!questions) return res.status(500).json({ error: "Failed to parse AI output" });

    res.json({ questions });
  } catch (err) {
    console.error("❌ Error generating questions:", err.message);
    res.status(500).json({ error: "Gemini API call failed" });
  }
});

// 3) Grade Answer (AI)
app.post('/api/grade-answer', async (req, res) => {
  console.log('📝 Received request: /api/grade-answer');
  try {
    const { question, answer } = req.body || {};
    if (!question || !answer) return res.status(400).json({ error: "Missing question or answer" });

    const prompt = `
      You are an AI interview evaluator.
      Evaluate the candidate's answer.
      Provide:
      - A numeric score between 0 and 10
      - A short feedback sentence (max 2 lines)

      Question: ${question}
      Candidate Answer: ${answer}

      Return strict JSON:
      { "score": number, "feedback": "..." }
    `;

    const result = await model.generateContent(prompt);
    const grading = extractJSON(result.response.text());

    if (!grading) return res.status(500).json({ error: "Failed to parse AI grading output" });

    res.json(grading);
  } catch (err) {
    console.error("❌ Error grading answer:", err.message);
    res.status(500).json({ error: "Gemini grading failed" });
  }
});

// 4) Final Summary (AI)
app.post('/api/final-summary', async (req, res) => {
  console.log('📊 Received request: /api/final-summary');
  try {
    const { candidate } = req.body || {};
    if (!candidate || !Array.isArray(candidate.answers)) {
      return res.status(400).json({ error: "Missing candidate answers" });
    }

    const prompt = `
      You are an AI interviewer. Create a final evaluation summary.
      Candidate Name: ${candidate.name || "Unknown"}
      Email: ${candidate.email || "Unknown"}
      Phone: ${candidate.phone || "Unknown"}

      Answers (JSON):
      ${JSON.stringify(candidate.answers, null, 2)}

      Task:
      - Calculate a final score as percentage (0–100).
      - Write a concise 3–4 sentence summary.

      Return strict JSON:
      { "finalScorePercent": number, "summary": "..." }
    `;

    const result = await model.generateContent(prompt);
    const finalEval = extractJSON(result.response.text());

    if (!finalEval) return res.status(500).json({ error: "Failed to parse AI final summary output" });

    res.json(finalEval);
  } catch (err) {
    console.error("❌ Error generating final summary:", err.message);
    res.status(500).json({ error: "Gemini final summary failed" });
  }
});

// ----------------- Start Server -----------------
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`));
