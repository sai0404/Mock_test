import { Router } from "express";
import { pool } from "../db/pool.js";
import { optionalAuth } from "../middleware/auth.js";

export const attemptsRouter = Router();

// Max proctoring violations before we auto-submit the test.
const MAX_VIOLATIONS = 5;

/**
 * POST /api/attempts/start  { examId, studentName }
 * Creates an attempt + one attempt_answers row per question (status 'not_visited').
 * Works for logged-in students (req.user) or guests (studentName only).
 */
attemptsRouter.post("/start", optionalAuth, async (req, res) => {
  const { examId, studentName } = req.body;
  if (!examId) return res.status(400).json({ error: "examId is required." });
  if (!req.user && !studentName) {
    return res.status(400).json({ error: "studentName is required for guest attempts." });
  }

  const exam = await pool.query("SELECT * FROM exams WHERE id = $1 AND status = 'published'", [examId]);
  if (!exam.rows[0]) return res.status(404).json({ error: "Exam not found or not published." });

  const attemptRes = await pool.query(
    `INSERT INTO attempts (exam_id, user_id, student_name) VALUES ($1,$2,$3) RETURNING id, started_at`,
    [examId, req.user?.id || null, req.user?.name || studentName]
  );
  const attempt = attemptRes.rows[0];

  const questions = await pool.query("SELECT id FROM questions WHERE exam_id = $1", [examId]);
  for (const q of questions.rows) {
    await pool.query(
      `INSERT INTO attempt_answers (attempt_id, question_id, status) VALUES ($1,$2,'not_visited')
       ON CONFLICT (attempt_id, question_id) DO NOTHING`,
      [attempt.id, q.id]
    );
  }

  res.status(201).json({
    attemptId: attempt.id,
    startedAt: attempt.started_at,
    durationMinutes: exam.rows[0].duration_minutes,
  });
});

/**
 * PATCH /api/attempts/:id/answer
 * body: { questionId, selectedOption, numericValue, status }
 * - selectedOption: used for mcq questions ("a" | "b" | "c" | "d")
 * - numericValue: used for numerical-answer questions (number, e.g. JEE Mains style)
 * status one of: 'not_answered' | 'answered' | 'marked_review' | 'answered_marked_review'
 * Called on every "Save & Next" / "Mark for Review" / "Clear Response" — autosave, no full-page reload.
 */
attemptsRouter.patch("/:id/answer", async (req, res) => {
  const { id } = req.params;
  const { questionId, selectedOption, numericValue, status } = req.body;

  const attempt = await pool.query("SELECT status FROM attempts WHERE id = $1", [id]);
  if (!attempt.rows[0]) return res.status(404).json({ error: "Attempt not found." });
  if (attempt.rows[0].status !== "in_progress") {
    return res.status(409).json({ error: "This attempt has already been submitted." });
  }

  await pool.query(
    `UPDATE attempt_answers SET selected_option = $3, numeric_value = $4, status = $5
     WHERE attempt_id = $1 AND question_id = $2`,
    [
      id,
      questionId,
      selectedOption || null,
      numericValue === "" || numericValue == null ? null : Number(numericValue),
      status || "answered",
    ]
  );
  res.json({ ok: true });
});

/**
 * POST /api/attempts/:id/proctor-event
 * body: { eventType }  e.g. 'tab_switch' | 'fullscreen_exit' | 'copy_attempt' | 'blur'
 * Logs the event and increments violation_count. If it crosses MAX_VIOLATIONS, auto-submits.
 */
attemptsRouter.post("/:id/proctor-event", async (req, res) => {
  const { id } = req.params;
  const { eventType } = req.body;

  const attempt = await pool.query("SELECT status, violation_count FROM attempts WHERE id = $1", [id]);
  if (!attempt.rows[0]) return res.status(404).json({ error: "Attempt not found." });
  if (attempt.rows[0].status !== "in_progress") {
    return res.json({ ok: true, autoSubmitted: false }); // already done, ignore
  }

  await pool.query("INSERT INTO proctor_events (attempt_id, event_type) VALUES ($1,$2)", [id, eventType]);
  const updated = await pool.query(
    "UPDATE attempts SET violation_count = violation_count + 1 WHERE id = $1 RETURNING violation_count",
    [id]
  );
  const count = updated.rows[0].violation_count;

  let autoSubmitted = false;
  if (count >= MAX_VIOLATIONS) {
    await submitAttemptInternal(id, "auto_submitted");
    autoSubmitted = true;
  }

  res.json({ ok: true, violationCount: count, maxViolations: MAX_VIOLATIONS, autoSubmitted });
});

async function submitAttemptInternal(attemptId, status = "submitted") {
  const attempt = await pool.query("SELECT * FROM attempts WHERE id = $1", [attemptId]);
  if (!attempt.rows[0] || attempt.rows[0].status !== "in_progress") return null;
  const examId = attempt.rows[0].exam_id;

  const exam = await pool.query("SELECT marks_correct, marks_negative FROM exams WHERE id = $1", [examId]);
  const { marks_correct, marks_negative } = exam.rows[0];

  const answers = await pool.query(
    `SELECT aa.selected_option, aa.numeric_value, q.question_type, q.correct_option,
            q.numeric_answer, q.numeric_tolerance
     FROM attempt_answers aa JOIN questions q ON q.id = aa.question_id
     WHERE aa.attempt_id = $1`,
    [attemptId]
  );

  let score = 0;
  for (const row of answers.rows) {
    if (row.question_type === "numerical") {
      if (row.numeric_value == null) continue; // unattempted, no negative marking on skip
      const tolerance = Number(row.numeric_tolerance || 0);
      const isCorrect = Math.abs(Number(row.numeric_value) - Number(row.numeric_answer)) <= tolerance;
      // Numerical-type questions conventionally have no negative marking, even if the section does.
      if (isCorrect) score += Number(marks_correct);
    } else {
      if (!row.selected_option) continue;
      if (row.selected_option === row.correct_option) score += Number(marks_correct);
      else score -= Number(marks_negative);
    }
  }
  const totalMarks = answers.rows.length * Number(marks_correct);

  await pool.query(
    `UPDATE attempts SET status=$2, submitted_at=now(), score=$3, total_marks=$4 WHERE id=$1`,
    [attemptId, status, score, totalMarks]
  );
  return { score, totalMarks };
}

/**
 * POST /api/attempts/:id/submit
 * Final submit (manual, via Submit button). Scores the attempt.
 */
attemptsRouter.post("/:id/submit", async (req, res) => {
  const { id } = req.params;
  const result = await submitAttemptInternal(id, "submitted");
  if (!result) return res.status(409).json({ error: "Attempt already submitted or not found." });
  res.json({ ok: true, ...result });
});

/**
 * GET /api/attempts/:id/result
 * Full breakdown: score, per-question correct/wrong/unattempted, with explanations.
 */
attemptsRouter.get("/:id/result", async (req, res) => {
  const { id } = req.params;
  const attempt = await pool.query(
    `SELECT a.*, e.title AS exam_title FROM attempts a JOIN exams e ON e.id = a.exam_id WHERE a.id = $1`,
    [id]
  );
  if (!attempt.rows[0]) return res.status(404).json({ error: "Attempt not found." });
  if (attempt.rows[0].status === "in_progress") {
    return res.status(409).json({ error: "Attempt has not been submitted yet." });
  }

  const details = await pool.query(
    `SELECT q.question_number, q.question_type, q.question_text, q.options, q.correct_option,
            q.numeric_answer, q.numeric_tolerance, q.explanation,
            aa.selected_option, aa.numeric_value, aa.status
     FROM attempt_answers aa JOIN questions q ON q.id = aa.question_id
     WHERE aa.attempt_id = $1 ORDER BY q.question_number`,
    [id]
  );

  const rows = details.rows.map((r) => {
    let result;
    if (r.question_type === "numerical") {
      if (r.numeric_value == null) result = "unattempted";
      else {
        const tol = Number(r.numeric_tolerance || 0);
        result = Math.abs(Number(r.numeric_value) - Number(r.numeric_answer)) <= tol ? "correct" : "wrong";
      }
    } else {
      result = !r.selected_option ? "unattempted" : r.selected_option === r.correct_option ? "correct" : "wrong";
    }
    return { ...r, result };
  });

  const summary = {
    total: rows.length,
    correct: rows.filter((r) => r.result === "correct").length,
    wrong: rows.filter((r) => r.result === "wrong").length,
    unattempted: rows.filter((r) => r.result === "unattempted").length,
  };

  res.json({
    attempt: {
      id: attempt.rows[0].id,
      examTitle: attempt.rows[0].exam_title,
      status: attempt.rows[0].status,
      score: Number(attempt.rows[0].score),
      totalMarks: Number(attempt.rows[0].total_marks),
      violationCount: attempt.rows[0].violation_count,
      startedAt: attempt.rows[0].started_at,
      submittedAt: attempt.rows[0].submitted_at,
    },
    summary,
    questions: rows,
  });
});
