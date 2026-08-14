import { Router } from "express";
import fs from "fs/promises";
import { pool } from "../db/pool.js";
import { upload } from "../middleware/upload.js";
import { authRequired, adminOnly, optionalAuth } from "../middleware/auth.js";
import { extractText } from "../services/extractText.js";
import { parseExamFromText } from "../services/parseExam.js";
import { validateQuestions } from "../services/validateExam.js";

export const examsRouter = Router();

/**
 * POST /api/exams/upload
 * multipart/form-data: file, title, category, description, durationMinutes, marksCorrect, marksNegative
 * Admin only. Runs the full pipeline: extract -> AI parse -> validate -> save.
 */
examsRouter.post(
  "/upload",
  authRequired,
  adminOnly,
  upload.single("file"),
  async (req, res) => {
    const { title, category, description, durationMinutes, marksCorrect, marksNegative } = req.body;
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    if (!title || !title.trim()) return res.status(400).json({ error: "Exam name/title is required." });

    let examId;
    try {
      // 1. Create a placeholder exam row so we have an id to reference, status = processing
      const insertExam = await pool.query(
        `INSERT INTO exams (title, description, category, source_filename, duration_minutes,
                             marks_correct, marks_negative, status, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'processing',$8) RETURNING id`,
        [
          title.trim(),
          description || null,
          category || null,
          req.file.originalname,
          Number(durationMinutes) || 120,
          Number(marksCorrect) || 1,
          Number(marksNegative) || 0,
          req.user.id,
        ]
      );
      examId = insertExam.rows[0].id;

      // 2. Extract raw text
      const { text, pageCount } = await extractText(req.file.path, req.file.mimetype, req.file.originalname);
      await fs.unlink(req.file.path).catch(() => {});

      if (!text || text.trim().length < 50) {
        await pool.query(
          `UPDATE exams SET status='failed', parse_warnings=$2 WHERE id=$1`,
          [examId, JSON.stringify(["Little or no text could be extracted. If this is a scanned/image PDF, OCR support needs to be enabled — see extractText.js."])]
        );
        return res.status(422).json({
          error: "Could not extract readable text from this file (it may be a scanned image PDF that needs OCR).",
          examId,
        });
      }

      // 3. AI parse into structured questions
      const { questions, warnings: parseWarnings } = await parseExamFromText(text);

      if (!questions.length) {
        await pool.query(
          `UPDATE exams SET status='failed', parse_warnings=$2 WHERE id=$1`,
          [examId, JSON.stringify(parseWarnings.length ? parseWarnings : ["No questions could be extracted."])]
        );
        return res.status(422).json({ error: "No questions could be extracted from this file.", examId });
      }

      // 4. Validate
      const { validated, warnings: validationWarnings } = validateQuestions(questions);
      const allWarnings = [...parseWarnings, ...validationWarnings];

      // 5. Create sections (in order of first appearance) and insert questions
      const sectionIds = {};
      let sortOrder = 0;
      for (const q of validated) {
        const sectionName = q.section || "General";
        if (!sectionIds[sectionName]) {
          const s = await pool.query(
            `INSERT INTO sections (exam_id, name, sort_order) VALUES ($1,$2,$3) RETURNING id`,
            [examId, sectionName, sortOrder++]
          );
          sectionIds[sectionName] = s.rows[0].id;
        }
      }

      for (const q of validated) {
        const sectionName = q.section || "General";
        await pool.query(
          `INSERT INTO questions
             (exam_id, section_id, question_number, question_type, question_text, options,
              correct_option, numeric_answer, explanation, needs_review)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (exam_id, question_number) DO NOTHING`,
          [
            examId,
            sectionIds[sectionName],
            q.question_number,
            q.question_type === "numerical" ? "numerical" : "mcq",
            q.question_text || "",
            q.question_type === "numerical" ? null : JSON.stringify(q.options || {}),
            q.question_type === "numerical" ? null : q.correct_option || null,
            q.question_type === "numerical" ? q.numeric_answer ?? null : null,
            q.explanation || null,
            q.needs_review,
          ]
        );
      }

      const needsReviewCount = validated.filter((q) => q.needs_review).length;
      const finalStatus = needsReviewCount > 0 ? "needs_review" : "published";

      await pool.query(
        `UPDATE exams SET status=$2, parse_warnings=$3, published_at = CASE WHEN $2='published' THEN now() ELSE NULL END
         WHERE id=$1`,
        [examId, finalStatus, JSON.stringify(allWarnings)]
      );

      res.status(201).json({
        examId,
        status: finalStatus,
        questionCount: validated.length,
        needsReviewCount,
        warnings: allWarnings,
      });
    } catch (err) {
      if (examId) {
        await pool
          .query(`UPDATE exams SET status='failed', parse_warnings=$2 WHERE id=$1`, [
            examId,
            JSON.stringify([err.message]),
          ])
          .catch(() => {});
      }
      res.status(500).json({ error: "Failed to process the uploaded exam.", detail: err.message, examId });
    }
  }
);

/**
 * GET /api/exams?q=search&category=...&status=published
 * Public search/browse of the exam library.
 */
examsRouter.get("/", optionalAuth, async (req, res) => {
  const { q, category } = req.query;
  const isAdmin = req.user?.role === "admin";
  const conditions = [];
  const params = [];

  // Non-admins only see published exams; admins can see everything (e.g. for review).
  if (!isAdmin) {
    conditions.push(`status = 'published'`);
  }
  if (q) {
    params.push(`%${q}%`);
    conditions.push(`title ILIKE $${params.length}`);
  }
  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT e.id, e.title, e.description, e.category, e.duration_minutes, e.status, e.created_at,
            (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count
     FROM exams e
     ${where}
     ORDER BY e.created_at DESC
     LIMIT 100`,
    params
  );
  res.json({ exams: rows });
});

/**
 * GET /api/exams/:id
 * Returns exam + sections + questions WITHOUT correct answers (for taking the test).
 */
examsRouter.get("/:id", optionalAuth, async (req, res) => {
  const { id } = req.params;
  const examRes = await pool.query("SELECT * FROM exams WHERE id = $1", [id]);
  const exam = examRes.rows[0];
  if (!exam) return res.status(404).json({ error: "Exam not found." });
  if (exam.status !== "published" && req.user?.role !== "admin") {
    return res.status(403).json({ error: "This exam is not yet published." });
  }

  const sectionsRes = await pool.query(
    "SELECT id, name, sort_order FROM sections WHERE exam_id = $1 ORDER BY sort_order",
    [id]
  );
  const questionsRes = await pool.query(
    `SELECT id, section_id, question_number, question_type, question_text, options
     FROM questions WHERE exam_id = $1 ORDER BY question_number`,
    [id]
  );

  res.json({
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      category: exam.category,
      durationMinutes: exam.duration_minutes,
      marksCorrect: Number(exam.marks_correct),
      marksNegative: Number(exam.marks_negative),
    },
    sections: sectionsRes.rows,
    questions: questionsRes.rows,
  });
});

/**
 * GET /api/exams/:id/admin  — includes correct answers + needs_review flags, admin only.
 * Useful for a manual-review/edit screen.
 */
examsRouter.get("/:id/admin", authRequired, adminOnly, async (req, res) => {
  const { id } = req.params;
  const examRes = await pool.query("SELECT * FROM exams WHERE id = $1", [id]);
  if (!examRes.rows[0]) return res.status(404).json({ error: "Exam not found." });
  const questionsRes = await pool.query(
    "SELECT * FROM questions WHERE exam_id = $1 ORDER BY question_number",
    [id]
  );
  res.json({ exam: examRes.rows[0], questions: questionsRes.rows });
});

/**
 * PATCH /api/exams/:id/questions/:qid — admin edits a flagged question, then republish.
 */
examsRouter.patch("/:id/questions/:qid", authRequired, adminOnly, async (req, res) => {
  const { qid } = req.params;
  const { question_text, options, correct_option, explanation } = req.body;
  await pool.query(
    `UPDATE questions SET
       question_text = COALESCE($2, question_text),
       options = COALESCE($3, options),
       correct_option = COALESCE($4, correct_option),
       explanation = COALESCE($5, explanation),
       needs_review = false
     WHERE id = $1`,
    [qid, question_text, options ? JSON.stringify(options) : null, correct_option, explanation]
  );
  res.json({ ok: true });
});

/** POST /api/exams/:id/publish — admin manually publishes after fixing flagged questions. */
examsRouter.post("/:id/publish", authRequired, adminOnly, async (req, res) => {
  const { id } = req.params;
  const remaining = await pool.query(
    "SELECT COUNT(*) FROM questions WHERE exam_id = $1 AND needs_review = true",
    [id]
  );
  if (Number(remaining.rows[0].count) > 0) {
    return res.status(400).json({ error: "Some questions still need review before publishing." });
  }
  await pool.query("UPDATE exams SET status='published', published_at=now() WHERE id=$1", [id]);
  res.json({ ok: true });
});
