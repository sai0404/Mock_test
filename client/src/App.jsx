import { Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ExamLibrary from "./pages/ExamLibrary";
import AdminUpload from "./pages/AdminUpload";
import StartAttempt from "./pages/StartAttempt";
import TestPortal from "./pages/TestPortal";
import Results from "./pages/Results";

function Nav() {
  const { user, logout } = useAuth();
  const location = useLocation();
  // Hide the nav entirely during the locked test — no navigation chrome during a strict exam.
  if (location.pathname.includes("/test")) return null;

  return (
    <div className="top-nav">
      <Link to="/exams" className="brand">Mock Test Portal</Link>
      <div className="nav-links">
        <Link to="/exams">Exam Library</Link>
        {user?.role === "admin" && <Link to="/admin/upload">Upload Exam</Link>}
        {user ? (
          <>
            <span>Hi, {user.name}</span>
            <button className="linklike" onClick={logout}>Log out</button>
          </>
        ) : (
          <Link to="/login">Log in</Link>
        )}
      </div>
    </div>
  );
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Nav />
      <Routes>
        <Route path="/" element={<Navigate to="/exams" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/exams" element={<ExamLibrary />} />
        <Route path="/exams/:examId/start" element={<StartAttempt />} />
        <Route path="/attempts/:attemptId/test" element={<TestPortal />} />
        <Route path="/attempts/:attemptId/result" element={<Results />} />
        <Route
          path="/admin/upload"
          element={
            <RequireAdmin>
              <AdminUpload />
            </RequireAdmin>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
