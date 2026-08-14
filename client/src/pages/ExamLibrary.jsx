import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

const STATUS_LABEL = {
  published: "Published",
  needs_review: "Needs Review",
  processing: "Processing",
  failed: "Failed",
};

export default function ExamLibrary() {
  const [exams, setExams] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function load(query) {
    setLoading(true);
    setError("");
    try {
      const res = await api.listExams(query);
      setExams(res.exams);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("");
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    load(q);
  }

  return (
    <div className="app-shell">
      <h2>Exam Library</h2>
      <p style={{ color: "var(--muted)" }}>Search and attempt published mock tests.</p>

      <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, margin: "16px 0 24px" }}>
        <input
          placeholder="Search exams by name, e.g. 'UPUMS 2021 Mock Paper'"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-primary" type="submit">
          Search
        </button>
      </form>

      {loading && <p>Loading exams...</p>}
      {error && <div className="error-text">{error}</div>}
      {!loading && exams.length === 0 && <p>No exams found. Try a different search, or ask an admin to upload one.</p>}

      {exams.map((exam) => (
        <div className="exam-list-item" key={exam.id}>
          <div>
            <h3>{exam.title}</h3>
            <div className="meta">
              {exam.category || "General"} • {exam.question_count} questions • {exam.duration_minutes} min
              {exam.status !== "published" && (
                <> • <span className={`badge badge-${exam.status}`}>{STATUS_LABEL[exam.status]}</span></>
              )}
            </div>
          </div>
          <button
            className="btn btn-primary"
            disabled={exam.status !== "published"}
            onClick={() => navigate(`/exams/${exam.id}/start`)}
          >
            Start Test
          </button>
        </div>
      ))}
    </div>
  );
}
