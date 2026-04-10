/**
 * chatRoute.js
 * Express router - mount in your server.js:
 *
 *   const chatRoute = require("./chat/chatRoute");
 *   app.use("/api", chatRoute);
 *
 * Endpoints:
 *   POST /api/chat           → main chat endpoint
 *   GET  /api/unanswered     → view unanswered questions (admin)
 *   POST /api/chat/rebuild   → re-index knowledge base (admin)
 */

const express = require("express");
const router = express.Router();
const sql = require("mssql");
const path = require("path");
const { exec } = require("child_process");

const { searchKnowledge } = require("./searchEngine");
const { formatReply, fallbackReply, CONTACT } = require("./replyFormatter");

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

// ── Save unanswered question to MSSQL ──
async function saveUnansweredQuestion(question) {
  try {
    const pool = await sql.connect(dbConfig);
    await pool
      .request()
      .input("UnAnswered", sql.NVarChar(sql.MAX), question)
      .input("CreatedBy", sql.Int, 1)
      .input("CreatedDt", sql.DateTime, new Date())
      .query(`
        IF NOT EXISTS (
          SELECT 1 FROM [dbo].[UnAnswered]
          WHERE UnAnswered = @UnAnswered
        )
        INSERT INTO [dbo].[UnAnswered] (UnAnswered, CreatedBy, CreatedDt)
        VALUES (@UnAnswered, @CreatedBy, @CreatedDt)
      `);
  } catch (err) {
    console.error("⚠️  Could not save unanswered question:", err.message);
  }
}

// ─────────────────────────────────────────────
// POST /api/chat
// ─────────────────────────────────────────────
router.post("/chat", async (req, res) => {
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const query = message.trim();

  try {
    const { answer, confidence, isAnswered } = await searchKnowledge(query);

    let reply = null;

    if (isAnswered && answer) {
      reply = formatReply(answer, query);
    }

    if (!reply) {
      reply = fallbackReply();
      await saveUnansweredQuestion(query);

      return res.json({
        reply,
        confidence: parseFloat(confidence.toFixed(4)),
        answered: false,
      });
    }

    return res.json({
      reply,
      confidence: parseFloat(confidence.toFixed(4)),
      answered: true,
    });
  } catch (err) {
    console.error("❌ /api/chat error:", err.message);
    return res.json({
      reply: `Sorry, I'm having a little trouble right now. Please contact us directly:\n${CONTACT}`,
      confidence: 0,
      answered: false,
    });
  }
});

// ─────────────────────────────────────────────
// GET /api/unanswered
// ─────────────────────────────────────────────
router.get("/unanswered", async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request().query(`
      SELECT 
        UnAnsweredID,
        UnAnswered,
        CreatedBy,
        CreatedDt,
        ModifiedBy,
        ModifiedDt
      FROM [dbo].[UnAnswered]
      ORDER BY CreatedDt DESC
    `);
    res.json({ success: true, questions: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/chat/rebuild
// ─────────────────────────────────────────────
router.post("/chat/rebuild", (req, res) => {
  const scriptPath = path.join(__dirname, "buildIndex.js");
  exec(`node ${scriptPath}`, (err, stdout, stderr) => {
    if (err) {
      console.error("Rebuild error:", stderr);
      return res.status(500).json({ success: false, error: stderr });
    }
    console.log("Rebuild output:", stdout);
    res.json({ success: true, output: stdout });
  });
});

module.exports = router;