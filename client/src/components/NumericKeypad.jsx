/**
 * On-screen numeric keypad for "numerical value" type questions (JEE Mains style).
 * Supports digits, a single decimal point, a leading minus sign, and backspace/clear.
 * Also works fine with a physical keyboard since the underlying value is just a string,
 * but the keypad is what most test centres expect since typing is often disabled.
 */
export default function NumericKeypad({ value, onChange }) {
  const val = value ?? "";

  function press(key) {
    if (key === "back") {
      onChange(val.slice(0, -1));
      return;
    }
    if (key === "clear") {
      onChange("");
      return;
    }
    if (key === "-") {
      // toggle leading negative sign
      onChange(val.startsWith("-") ? val.slice(1) : "-" + val);
      return;
    }
    if (key === ".") {
      if (val.includes(".")) return; // only one decimal point allowed
      onChange(val + ".");
      return;
    }
    // digit
    onChange(val + key);
  }

  return (
    <div className="numeric-answer-area">
      <div className="numeric-display">{val || <span style={{ color: "#9aa5b1" }}>Enter value</span>}</div>
      <div className="numeric-hint">Enter a numeric value (decimals and negative numbers allowed).</div>
      <div className="numeric-keypad">
        {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((d) => (
          <button key={d} onClick={() => press(d)} type="button">
            {d}
          </button>
        ))}
        <button onClick={() => press("-")} type="button" title="Toggle negative">
          +/&minus;
        </button>
        <button onClick={() => press("0")} type="button">
          0
        </button>
        <button onClick={() => press(".")} type="button">
          .
        </button>
        <button onClick={() => press("back")} type="button" className="backspace">
          ⌫
        </button>
        <button onClick={() => press("clear")} type="button" className="clear">
          Clear
        </button>
      </div>
    </div>
  );
}
