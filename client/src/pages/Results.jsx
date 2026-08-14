import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api";

export default function Results() {
  const { attemptId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getResult(attemptId)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [attemptId]);

  if (error) return <div className="app-shell"><div className="error-text">{error}</div></div>;
  if (!data) return <div className="app-shell">Loading result...</div>;

  const { attempt, summary, questions } = data;
  const percent = attempt.totalMarks > 0 ? ((attempt.score / attempt.totalMarks) * 100).toFixed(1) : "0.0";

  return (
    <div className="app-shell">
      <h2>{attempt.examTitle} — Result</h2>
      {attempt.status === "auto_submitted" && (
        <div className="card" style={{ background: "#fbe1de", border: "1px solid #e3a89f" }}>
          This test was <strong>auto-submitted</strong> after {attempt.violationCount} proctoring violations
          (tab switches / fullscreen exits / copy attempts).
        </div>
      )}

      <div className="result-summary-grid">
        <div className="result-stat">
          <div className="num" style={{ color: "var(--blue-dark)" }}>{attempt.score} / {attempt.totalMarks}</div>
          <div className="lbl">Score ({percent}%)</div>
        </div>
        <div className="result-stat">
          <div className="num" style={{ color: "var(--green)" }}>{summary.correct}</div>
          <div className="lbl">Correct</div>
        </div>
        <div className="result-stat">
          <div className="num" style={{ color: "#c0392b" }}>{summary.wrong}</div>
          <div className="lbl">Wrong</div>
        </div>
        <div className="result-stat">
          <div className="num" style={{ color: "var(--muted)" }}>{summary.unattempted}</div>
          <div className="lbl">Unattempted</div>
        </div>
      </div>

      <h3>Question-by-question review</h3>
      {questions.map((q) => (
        <div key={q.question_number} className={`review-question ${q.result}`}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong>Q{q.question_number}. {q.question_text}</strong>
            <span className={`badge ${q.result === "correct" ? "badge-published" : q.result === "wrong" ? "badge-failed" : "badge-processing"}`}>
              {q.result}
            </span>
          </div>

          {q.question_type === "numerical" ? (
            <div style={{ marginTop: 8, fontSize: "0.9rem" }}>
              <div>Your answer: <strong>{q.numeric_value ?? "— not answered —"}</strong></div>
              <div>Correct answer: <strong>{q.numeric_answer}</strong></div>
            </div>
          ) : (
            <div style={{ marginTop: 8, fontSize: "0.9rem" }}>
              {Object.entries(q.options || {}).map(([letter, text]) => {
                const isCorrect = letter === q.correct_option;
                const isSelected = letter === q.selected_option;
                return (
                  <div
                    key={letter}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 4,
                      marginBottom: 2,
                      background: isCorrect ? "#e2f5e5" : isSelected ? "#fbe1de" : "transparent",
                      fontWeight: isCorrect || isSelected ? 600 : 400,
                    }}
                  >
                    {letter.toUpperCase()}. {text}
                    {isCorrect && " ✓ correct answer"}
                    {isSelected && !isCorrect && " ✗ your answer"}
                  </div>
                );
              })}
            </div>
          )}

          {q.explanation && (
            <div style={{ marginTop: 8, fontSize: "0.85rem", color: "var(--muted)" }}>
              <strong>Explanation:</strong> {q.explanation}
            </div>
          )}
        </div>
      ))}

      <Link to="/exams" className="btn btn-primary" style={{ display: "inline-block", marginTop: 10 }}>
        Back to Exam Library
      </Link>
    </div>
  );
}
