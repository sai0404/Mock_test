import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

/**
 * Enforces a "strict exam" lockdown for the given attemptId:
 * - Requires fullscreen; if the user exits fullscreen, shows a blocking overlay and logs a violation.
 * - Detects tab switch / window blur (visibilitychange, blur) and logs a violation.
 * - Blocks copy, cut, right-click context menu, and common devtools/print shortcuts.
 * - Reports each violation to the backend; if the server says the attempt was auto-submitted
 *   (too many violations), calls onAutoSubmit().
 *
 * Returns { inFullscreen, violationCount, maxViolations, requestFullscreen }.
 */
export function useFullscreenLockdown(attemptId, active, onAutoSubmit) {
  const [inFullscreen, setInFullscreen] = useState(!!document.fullscreenElement);
  const [violationCount, setViolationCount] = useState(0);
  const [maxViolations, setMaxViolations] = useState(5);
  const reportingRef = useRef(false);

  const requestFullscreen = useCallback(() => {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (req) req.call(el).catch(() => {});
  }, []);

  const reportViolation = useCallback(
    async (eventType) => {
      if (!active || !attemptId || reportingRef.current) return;
      reportingRef.current = true;
      try {
        const res = await api.proctorEvent(attemptId, eventType);
        setViolationCount(res.violationCount);
        setMaxViolations(res.maxViolations);
        if (res.autoSubmitted) onAutoSubmit();
      } catch {
        /* best-effort logging; don't block the student on a network hiccup */
      } finally {
        reportingRef.current = false;
      }
    },
    [active, attemptId, onAutoSubmit]
  );

  useEffect(() => {
    if (!active) return;

    function handleFsChange() {
      const fs = !!document.fullscreenElement;
      setInFullscreen(fs);
      if (!fs) reportViolation("fullscreen_exit");
    }
    function handleVisibility() {
      if (document.hidden) reportViolation("tab_switch");
    }
    function handleBlur() {
      reportViolation("blur");
    }
    function handleCopyCut(e) {
      e.preventDefault();
      reportViolation("copy_attempt");
    }
    function handleContextMenu(e) {
      e.preventDefault();
    }
    function handleKeyDown(e) {
      // Block common ways to exit/inspect: F11 toggling manually is fine (we re-request),
      // but block devtools, view-source, printing, and browser find.
      const blocked =
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key.toUpperCase())) ||
        (e.ctrlKey && ["p", "u", "s"].includes(e.key.toLowerCase()));
      if (blocked) {
        e.preventDefault();
        reportViolation("devtools");
      }
    }

    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("copy", handleCopyCut);
    document.addEventListener("cut", handleCopyCut);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);

    requestFullscreen();

    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("copy", handleCopyCut);
      document.removeEventListener("cut", handleCopyCut);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return { inFullscreen, violationCount, maxViolations, requestFullscreen };
}
