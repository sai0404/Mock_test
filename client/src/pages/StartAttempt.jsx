import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";

export default function StartAttempt() {
  const { examId } = useParams();
  const [exam, setExam] = useState(null);
  const [studentName, setStudentName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api
      .getExam(examId)
      .then((res) => setExam(res.exam))
      .catch((err) => setError(err.message));
  }, [examId]);

  async function handleStart() {
    setError("");
    if (!user && !studentName.trim()) {
      setError("Please enter your name to begin.");
      return;
    }
    setStarting(true);
    try {
      const res = await api.startAttempt({ examId, studentName });
      navigate(`/attempts/${res.attemptId}/test`, {
        state: { durationMinutes: res.durationMinutes, startedAt: res.startedAt, examId },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  if (error && !exam) return <div className="app-shell"><div className="error-text">{error}</div></div>;
  if (!exam) return <div className="app-shell">Loading...</div>;

  return (
    <div className="app-shell" style={{ maxWidth: 640 }}>
      <div className="card">
        <h2>{exam.title}</h2>
        {exam.description && <p style={{ color: "var(--muted)" }}>{exam.description}</p>}
        <ul style={{ lineHeight: 1.8 }}>
          <li>Duration: <strong>{exam.durationMinutes} minutes</strong></li>
          <li>Marking: +{exam.marksCorrect} for correct, -{exam.marksNegative} for wrong (MCQ)</li>
          <li>Numerical-answer questions: no negative marking on incorrect/skipped entries</li>
        </ul>

        <div className="card" style={{ background: "#fff8ee", border: "1px solid #f0d9a8" }}>
          <strong>Strict exam mode</strong>
          <p style={{ margin: "8px 0 0", fontSize: "0.9rem" }}>
            This test runs in fullscreen and locks tab-switching, copy/paste, right-click, and
            devtools shortcuts. Exiting fullscreen or switching tabs is logged as a violation —
            repeated violations will auto-submit your test. Once you click "Begin Test", your
            browser will enter fullscreen mode.
          </p>
        </div>

        {!user && (
          <>
            <label>Your name (for the result report)</label>
            <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="e.g. Sai Kumar" />
          </>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span style={{ fontWeight: 400, color: "var(--text)" }}>I understand and agree to the strict exam conditions above.</span>
        </label>

        {error && <div className="error-text">{error}</div>}

        <button className="btn btn-primary" style={{ marginTop: 18, width: "100%" }} disabled={!agreed || starting} onClick={handleStart}>
          {starting ? "Starting..." : "Begin Test (Fullscreen)"}
        </button>
      </div>
    </div>
  );
}
