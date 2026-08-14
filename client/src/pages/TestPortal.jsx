import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import Timer from "../components/Timer";
import QuestionPalette from "../components/QuestionPalette";
import NumericKeypad from "../components/NumericKeypad";
import { useFullscreenLockdown } from "../hooks/useFullscreenLockdown";

export default function TestPortal() {
  const { attemptId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [examData, setExamData] = useState(null); // { exam, sections, questions }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [currentQId, setCurrentQId] = useState(null);
  const [answersByQ, setAnswersByQ] = useState({}); // { [questionId]: { status, selectedOption, numericValue } }
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  const durationMinutes = location.state?.durationMinutes;
  const startedAt = location.state?.startedAt;

  // Load exam structure. We need the examId — fetch it indirectly isn't available from attemptId,
  // so we rely on state passed during navigation; if missing (e.g. page refresh), fall back gracefully.
  const examId = location.state?.examId;

  useEffect(() => {
    async function load() {
      try {
        // If examId wasn't passed via navigation state (e.g. hard refresh), we can't recover the
        // question list from the attemptId alone in this minimal API — in production add
        // GET /api/attempts/:id -> examId. For now this handles the normal flow.
        if (!examId) {
          setError("Session data was lost (likely a page refresh). Please restart the test from the exam library.");
          setLoading(false);
          return;
        }
        const res = await api.getExam(examId);
        setExamData(res);
        setActiveSectionId(res.sections[0]?.id ?? null);
        setCurrentQId(res.questions[0]?.id ?? null);

        const initial = {};
        for (const q of res.questions) {
          initial[q.id] = { status: "not_visited", selectedOption: null, numericValue: "" };
        }
        // mark first question visited
        if (res.questions[0]) initial[res.questions[0].id].status = "not_answered";
        setAnswersByQ(initial);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const doSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      await api.submitAttempt(attemptId);
    } catch {
      /* even if this errors (e.g. already auto-submitted), still route to results */
    }
    navigate(`/attempts/${attemptId}/result`, { replace: true });
  }, [attemptId, navigate]);

  const { violationCount, maxViolations, inFullscreen, requestFullscreen } = useFullscreenLockdown(
    attemptId,
    !loading && !submitting,
    doSubmit
  );

  if (loading) return <div className="app-shell">Loading test...</div>;
  if (error)
    return (
      <div className="app-shell">
        <div className="error-text">{error}</div>
        <button className="btn" onClick={() => navigate("/exams")}>
          Back to Exam Library
        </button>
      </div>
    );

  const { exam, sections, questions } = examData;
  const sectionQuestions = questions.filter((q) => q.section_id === activeSectionId);
  const currentQ = questions.find((q) => q.id === currentQId);
  const currentIndexInSection = sectionQuestions.findIndex((q) => q.id === currentQId);
  const deadline = new Date(startedAt).getTime() + durationMinutes * 60 * 1000;

  function updateAnswer(qId, patch) {
    setAnswersByQ((prev) => ({ ...prev, [qId]: { ...prev[qId], ...patch } }));
  }

  function goTo(qId) {
    setCurrentQId(qId);
    setAnswersByQ((prev) => {
      const cur = prev[qId];
      if (cur.status === "not_visited") return { ...prev, [qId]: { ...cur, status: "not_answered" } };
      return prev;
    });
    const q = questions.find((x) => x.id === qId);
    if (q && q.section_id !== activeSectionId) setActiveSectionId(q.section_id);
  }

  async function persist(qId, status) {
    const a = answersByQ[qId];
    await api
      .saveAnswer(attemptId, {
        questionId: qId,
        selectedOption: a.selectedOption,
        numericValue: a.numericValue,
        status,
      })
      .catch(() => {}); // best-effort autosave; UI state is source of truth for the palette
  }

  function nextQuestion() {
    const idx = questions.findIndex((q) => q.id === currentQId);
    const next = questions[idx + 1];
    if (next) goTo(next.id);
  }

  async function handleSaveNext() {
    const a = answersByQ[currentQId];
    const hasAnswer =
      currentQ.question_type === "numerical" ? a.numericValue !== "" && a.numericValue != null : !!a.selectedOption;
    const status = hasAnswer ? "answered" : "not_answered";
    updateAnswer(currentQId, { status });
    await persist(currentQId, status);
    nextQuestion();
  }

  async function handleMarkReview() {
    const a = answersByQ[currentQId];
    const hasAnswer =
      currentQ.question_type === "numerical" ? a.numericValue !== "" && a.numericValue != null : !!a.selectedOption;
    const status = hasAnswer ? "answered_marked_review" : "marked_review";
    updateAnswer(currentQId, { status });
    await persist(currentQId, status);
    nextQuestion();
  }

  async function handleClear() {
    updateAnswer(currentQId, { selectedOption: null, numericValue: "", status: "not_answered" });
    await persist(currentQId, "not_answered");
  }

  function handlePrevious() {
    const idx = questions.findIndex((q) => q.id === currentQId);
    const prev = questions[idx - 1];
    if (prev) goTo(prev.id);
  }

  const answeredCount = Object.values(answersByQ).filter((a) =>
    ["answered", "answered_marked_review"].includes(a.status)
  ).length;
  const notAnsweredCount = Object.values(answersByQ).filter((a) => a.status === "not_answered").length;

  return (
    <div className="test-portal">
      {!inFullscreen && (
        <div className="lockdown-overlay">
          <h2>Fullscreen Required</h2>
          <p>
            This exam must be taken in fullscreen mode. You currently have{" "}
            <span className="violation-count">
              {violationCount} / {maxViolations}
            </span>{" "}
            violations. Exiting fullscreen again will count as another violation. After{" "}
            {maxViolations} violations your test will be auto-submitted.
          </p>
          <button className="btn btn-primary" onClick={requestFullscreen}>
            Resume Fullscreen &amp; Continue Test
          </button>
        </div>
      )}

      <div className="test-header">
        <div className="exam-title">{exam.title}</div>
        <div className="candidate">
          Violations: {violationCount}/{maxViolations}
        </div>
      </div>

      <div className="section-tabs">
        {sections.map((s) => (
          <button
            key={s.id}
            className={`section-tab ${s.id === activeSectionId ? "active" : ""}`}
            onClick={() => {
              setActiveSectionId(s.id);
              const firstQ = questions.find((q) => q.section_id === s.id);
              if (firstQ) goTo(firstQ.id);
            }}
            type="button"
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="test-body">
        <div className="question-pane">
          {currentQ && (
            <>
              <div className="question-meta-bar">
                <span>
                  Question {currentIndexInSection + 1} of {sectionQuestions.length} ({sections.find((s) => s.id === activeSectionId)?.name})
                </span>
                <span>
                  {currentQ.question_type === "numerical" ? "Numerical Value Type" : "MCQ"} • Marks: +{exam.marksCorrect}
                  {currentQ.question_type === "mcq" && exam.marksNegative > 0 && ` / -${exam.marksNegative}`}
                </span>
              </div>

              <div className="question-text">
                Q{currentIndexInSection + 1}. {currentQ.question_text}
              </div>

              {currentQ.question_type === "numerical" ? (
                <NumericKeypad
                  value={answersByQ[currentQ.id]?.numericValue}
                  onChange={(v) => updateAnswer(currentQ.id, { numericValue: v })}
                />
              ) : (
                <div>
                  {Object.entries(currentQ.options || {}).map(([letter, text]) => (
                    <label
                      key={letter}
                      className={`option-row ${answersByQ[currentQ.id]?.selectedOption === letter ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name={`q-${currentQ.id}`}
                        checked={answersByQ[currentQ.id]?.selectedOption === letter}
                        onChange={() => updateAnswer(currentQ.id, { selectedOption: letter })}
                      />
                      <span className="option-letter">{letter.toUpperCase()}.</span>
                      <span>{text}</span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <QuestionPalette questions={questions} answersByQ={answersByQ} currentId={currentQId} onJump={goTo} />
      </div>

      <div className="test-footer">
        <div className="left-actions">
          <button className="btn" onClick={handleMarkReview} type="button">
            Mark for Review &amp; Next
          </button>
          <button className="btn" onClick={handleClear} type="button">
            Clear Response
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
            Answered: {answeredCount} • Not Answered: {notAnsweredCount}
          </span>
          <Timer deadline={deadline} onExpire={doSubmit} />
        </div>
        <div className="right-actions">
          <button className="btn" onClick={handlePrevious} type="button" disabled={questions[0]?.id === currentQId}>
            Previous
          </button>
          <button className="btn btn-primary" onClick={handleSaveNext} type="button">
            Save &amp; Next
          </button>
          <button
            className="btn btn-danger"
            type="button"
            disabled={submitting}
            onClick={() => {
              if (window.confirm("Submit the test now? You won't be able to change answers after this.")) {
                doSubmit();
              }
            }}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
