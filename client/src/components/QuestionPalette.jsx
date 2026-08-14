const LEGEND = [
  { key: "not_visited", label: "Not Visited", color: "#b8c2cc" },
  { key: "not_answered", label: "Not Answered", color: "#c0392b" },
  { key: "answered", label: "Answered", color: "#3f9142" },
  { key: "marked_review", label: "Marked for Review", color: "#7a4fa3" },
];

export default function QuestionPalette({ questions, answersByQ, currentId, onJump }) {
  const counts = { not_visited: 0, not_answered: 0, answered: 0, marked_review: 0, answered_marked_review: 0 };
  for (const q of questions) {
    const st = answersByQ[q.id]?.status || "not_visited";
    counts[st] = (counts[st] || 0) + 1;
  }

  return (
    <div className="sidebar">
      <div className="legend">
        {LEGEND.map((l) => (
          <div className="legend-item" key={l.key}>
            <span className="legend-swatch" style={{ background: l.color }}>
              {counts[l.key] + (l.key === "marked_review" ? counts.answered_marked_review : 0)}
            </span>
            <span>{l.label}</span>
          </div>
        ))}
      </div>

      <div className="palette-grid">
        {questions.map((q, idx) => {
          const status = answersByQ[q.id]?.status || "not_visited";
          const isCurrent = q.id === currentId;
          return (
            <button
              key={q.id}
              className={`palette-btn ${status} ${isCurrent ? "current" : ""}`}
              onClick={() => onJump(q.id)}
              title={`Question ${idx + 1}`}
              type="button"
            >
              {idx + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
