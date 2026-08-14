const BASE = "/api";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  register: (body) =>
    fetch(`${BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle),

  login: (body) =>
    fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle),

  listExams: (q = "") =>
    fetch(`${BASE}/exams${q ? `?q=${encodeURIComponent(q)}` : ""}`, { headers: authHeaders() }).then(handle),

  getExam: (id) => fetch(`${BASE}/exams/${id}`, { headers: authHeaders() }).then(handle),

  uploadExam: (formData) =>
    fetch(`${BASE}/exams/upload`, {
      method: "POST",
      headers: authHeaders(), // don't set Content-Type, browser sets multipart boundary
      body: formData,
    }).then(handle),

  startAttempt: (body) =>
    fetch(`${BASE}/attempts/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle),

  saveAnswer: (attemptId, body) =>
    fetch(`${BASE}/attempts/${attemptId}/answer`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle),

  proctorEvent: (attemptId, eventType) =>
    fetch(`${BASE}/attempts/${attemptId}/proctor-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType }),
    }).then(handle),

  submitAttempt: (attemptId) =>
    fetch(`${BASE}/attempts/${attemptId}/submit`, { method: "POST" }).then(handle),

  getResult: (attemptId) => fetch(`${BASE}/attempts/${attemptId}/result`).then(handle),
};
