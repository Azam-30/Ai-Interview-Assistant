// api/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Log check to confirm serverless start
console.log("🚀 Vercel API initialized successfully.");

// Gemini API setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

// -----------------------------
// 🔹 Helper Functions
// -----------------------------
function extractJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

const extractEmail = (text) =>
  text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/)?.[0] || null;

const extractPhone = (text) =>
  text.match(/(\+?\d{1,3}[\s-]?)?(\d{10}|\d{3}[\s-]\d{3}[\s-]\d{4})/)?.[0] ||
  null;

function extractName(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < Math.min(6, lines.length); i++) {
    const s = lines[i];
    if (!/resume/i.test(s) && /[A-Za-z]/.test(s) && s.split(" ").length <= 4)
      return s;
  }
  return null;
}

// -----------------------------
// 🔹 File Upload Handling
// -----------------------------
// Use `/tmp` for temporary storage in Vercel
const upload = multer({ dest: "/tmp" });

// -----------------------------
// 🔹 API Routes
// -----------------------------

// 🧾 Parse Resume
app.post("/api/parse-resume", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const ext = path.extname(req.file.originalname).toLowerCase();
    let text = "";

    if (ext === ".pdf") {
      const data = fs.readFileSync(req.file.path);
      const pdf = await pdfParse(data);
      text = pdf.text || "";
    } else if (ext === ".docx") {
      const result = await mammoth.extractRawText({ path: req.file.path });
      text = result.value || "";
    } else {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Only PDF or DOCX allowed" });
    }

    const name = extractName(text);
    const email = extractEmail(text);
    const phone = extractPhone(text);

    fs.unlinkSync(req.file.path); // cleanup tmp file
    res.json({ name, email, phone, text });
  } catch (err) {
    console.error("❌ Resume parsing error:", err.message);
    res.status(500).json({ error: "Failed to parse resume" });
  }
});

// 🤖 Generate Questions
app.post("/api/generate-questions", async (req, res) => {
  try {
    const role = req.body.role || "Full Stack Developer";
    const stack = req.body.stack || ["React", "Node.js"];
    const prompt = `
      Generate 6 technical interview questions for a ${role} skilled in ${stack.join(", ")}.
      - 2 easy, 2 medium, 2 hard.
      Return strict JSON: [{"id":"q1","difficulty":"easy","text":"..."}]
    `;
    const result = await model.generateContent(prompt);
    const questions = extractJSON(result.response.text());
    if (!questions) throw new Error("Invalid AI JSON output");
    res.json({ questions });
  } catch (err) {
    console.error("❌ Question generation error:", err.message);
    res.status(500).json({ error: "Gemini question generation failed" });
  }
});

// 🧠 Grade Answer
app.post("/api/grade-answer", async (req, res) => {
  try {
    const { question, answer } = req.body;
    if (!question || !answer)
      return res.status(400).json({ error: "Missing data" });

    const prompt = `
      Evaluate this answer (0–10) with 1–2 lines of feedback.
      Question: ${question}
      Answer: ${answer}
      Return strict JSON: {"score": number, "feedback": "..."}
    `;
    const result = await model.generateContent(prompt);
    const grading = extractJSON(result.response.text());
    if (!grading) throw new Error("Invalid grading output");
    res.json(grading);
  } catch (err) {
    console.error("❌ Grading error:", err.message);
    res.status(500).json({ error: "Gemini grading failed" });
  }
});

// 📊 Final Summary
app.post("/api/final-summary", async (req, res) => {
  try {
    const { candidate } = req.body;
    if (!candidate || !candidate.answers)
      return res.status(400).json({ error: "Missing candidate data" });

    const prompt = `
      Summarize this interview:
      Name: ${candidate.name}
      Answers: ${JSON.stringify(candidate.answers, null, 2)}
      Return strict JSON: {"finalScorePercent": number, "summary": "..."}
    `;
    const result = await model.generateContent(prompt);
    const summary = extractJSON(result.response.text());
    if (!summary) throw new Error("Invalid summary output");
    res.json(summary);
  } catch (err) {
    console.error("❌ Summary error:", err.message);
    res.status(500).json({ error: "Gemini summary failed" });
  }
});

// -----------------------------
// ✅ Export Express App (Vercel style)
// -----------------------------
module.exports = app;
