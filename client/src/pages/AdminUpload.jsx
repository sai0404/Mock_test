import { useState } from "react";
import { api } from "../api";

export default function AdminUpload() {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [marksCorrect, setMarksCorrect] = useState(1);
  const [marksNegative, setMarksNegative] = useState(0);
  const [status, setStatus] = useState("idle"); // idle | uploading | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return setError("Please choose a PDF, DOCX, or TXT file.");
    setError("");
    setStatus("uploading");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("category", category);
    formData.append("description", description);
    formData.append("durationMinutes", durationMinutes);
    formData.append("marksCorrect", marksCorrect);
    formData.append("marksNegative", marksNegative);

    try {
      const res = await api.uploadExam(formData);
      setResult(res);
      setStatus("done");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  return (
    <div className="app-shell" style={{ maxWidth: 640 }}>
      <h2>Upload a New Exam</h2>
      <p style={{ color: "var(--muted)" }}>
        Upload a PDF, DOCX, or TXT file containing questions and an answer key (options or a
        numerical answer key, and optionally solutions). Claude will extract, structure, and
        validate the questions automatically. Exams with any flagged questions go to "Needs
        Review" instead of publishing immediately.
      </p>

      <form className="card" onSubmit={handleSubmit}>
        <label>Exam name *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. UPUMS 2021 Mock Paper I - PCB" required />

        <label>Category</label>
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Medical Entrance, JEE Mains" />

        <label>Description</label>
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />

        <div className="grid-2">
          <div>
            <label>Duration (minutes)</label>
            <input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} min={1} />
          </div>
          <div>
            <label>Marks per correct answer</label>
            <input type="number" step="0.25" value={marksCorrect} onChange={(e) => setMarksCorrect(e.target.value)} />
          </div>
        </div>
        <label>Negative marks per wrong MCQ answer</label>
        <input type="number" step="0.25" value={marksNegative} onChange={(e) => setMarksNegative(e.target.value)} />
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 4 }}>
          Numerical-value questions (JEE Mains style) are never negatively marked, even if this is set.
        </p>

        <label>Source file (PDF, DOCX, or TXT) *</label>
        <input type="file" accept=".pdf,.docx,.txt" onChange={(e) => setFile(e.target.files[0])} required />

        {error && <div className="error-text">{error}</div>}

        <button className="btn btn-primary" style={{ marginTop: 18, width: "100%" }} disabled={status === "uploading"}>
          {status === "uploading" ? "Parsing with AI... this can take a minute for large papers" : "Upload & Parse"}
        </button>
      </form>

      {status === "done" && result && (
        <div className="card">
          <h3>Upload complete</h3>
          <p>
            Status: <span className={`badge badge-${result.status}`}>{result.status.replace("_", " ")}</span>
          </p>
          <p>Extracted {result.questionCount} questions.</p>
          {result.needsReviewCount > 0 && (
            <p className="error-text">
              {result.needsReviewCount} question(s) need manual review before this exam can be
              published (see warnings below).
            </p>
          )}
          {result.warnings?.length > 0 && (
            <details>
              <summary>Parsing warnings ({result.warnings.length})</summary>
              <ul>
                {result.warnings.map((w, i) => (
                  <li key={i} style={{ fontSize: "0.85rem" }}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
