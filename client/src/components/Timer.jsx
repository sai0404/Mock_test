import { useEffect, useRef, useState } from "react";

/**
 * Countdown timer. `deadline` is a Date/timestamp of when the exam should end.
 * Calls onExpire() exactly once when time runs out.
 */
export default function Timer({ deadline, onExpire }) {
  const [remainingMs, setRemainingMs] = useState(() => deadline - Date.now());
  const expiredRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const rem = deadline - Date.now();
      setRemainingMs(rem);
      if (rem <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        clearInterval(interval);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline, onExpire]);

  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  const isLow = totalSeconds <= 300; // last 5 minutes

  return (
    <div className={`timer-box ${isLow ? "low-time" : ""}`}>
      <div className="label">Time Left</div>
      <div className="time">
        {h}:{m}:{s}
      </div>
    </div>
  );
}
