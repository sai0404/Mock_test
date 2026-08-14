/**
 * Runs sanity checks on AI-parsed questions before they are published.
 * Any question that fails a check is flagged `needs_review: true` rather
 * than being silently dropped, so an admin can fix it manually.
 */
export function validateQuestions(questions) {
  const warnings = [];
  const seen = new Set();

  const validated = questions.map((q) => {
    const issues = [];
    const type = q.question_type === "numerical" ? "numerical" : "mcq";

    if (!q.question_text || q.question_text.trim().length < 3) {
      issues.push("missing or too-short question text");
    }

    if (type === "mcq") {
      const optionKeys = Object.keys(q.options || {}).filter((k) => q.options[k]);
      if (optionKeys.length < 2) {
        issues.push("fewer than 2 options extracted");
      }
      if (!q.correct_option) {
        issues.push("no correct answer found");
      } else if (!optionKeys.includes(q.correct_option)) {
        issues.push(`correct_option '${q.correct_option}' does not match any extracted option`);
      }
    } else {
      // numerical type — no options expected, needs a numeric_answer
      if (q.numeric_answer == null || Number.isNaN(Number(q.numeric_answer))) {
        issues.push("no numeric answer found");
      }
    }

    if (q.question_number == null) {
      issues.push("missing question number");
    } else if (seen.has(q.question_number)) {
      issues.push("duplicate question number");
    } else {
      seen.add(q.question_number);
    }

    if (issues.length) {
      warnings.push(`Q${q.question_number ?? "?"}: ${issues.join(", ")}`);
    }

    return { ...q, question_type: type, needs_review: issues.length > 0 };
  });

  return { validated, warnings };
}
