import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
dotenv.config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You convert raw text extracted from an exam/question-paper document into
strict structured JSON. You will be shown a chunk of raw text that may contain: question numbers,
question text, multiple-choice options, numerical-answer-type questions (no options — student enters
a numeric value, common in JEE Mains-style papers, sometimes labeled "Numerical Value Type" or
"Integer Type"), an answer key (sometimes in a separate compact table like "1-b, 2-d, 3-a" or a list
at the end, and for numerical questions the key may just list a number like "5-  4.50" or "5- 12"),
and sometimes explanations/solutions.

Rules:
- Output ONLY valid JSON, no markdown fences, no commentary before or after.
- Return an array of question objects, one per question found in this chunk.
- Each object must match this exact shape:
  {
    "question_number": <integer>,
    "section": <string or null>,   // e.g. "Physics", "Chemistry", "Biology" if identifiable, else null
    "question_type": "mcq" | "numerical",
       // "mcq" if the question has answer options (a/b/c/d...) for the student to pick from.
       // "numerical" if the question expects the student to type in a numeric value with no options
       // (integer or decimal answer, no options given in the source text).
    "question_text": <string>,
    "options": { "a": <string>, "b": <string>, "c": <string>, "d": <string> } or null,
       // include only the option letters actually present (could be a-e). MUST be null for "numerical" type.
    "correct_option": <string or null>,
       // the letter, lowercase. MUST be null for "numerical" type. Null if not determinable from this chunk.
    "numeric_answer": <number or null>,
       // the correct numeric value. MUST be null for "mcq" type. Null if not determinable from this chunk.
    "explanation": <string or null>
  }
- If the answer key or explanations for these questions appear in a DIFFERENT chunk (e.g. a separate
  answer-key table later in the document), leave "correct_option"/"numeric_answer" null here — a later
  merge step will attach it.
- Never invent question text, options, or answers that are not present in the source text.
- If a question is ambiguous, malformed, or missing options, still include it with whatever fields
  you can extract, and set missing fields to null.
- Preserve mathematical notation, chemical formulas, and numbering exactly as written.`;

const ANSWER_KEY_PROMPT = `You are extracting an answer key table from raw exam text. Entries are
usually one of two kinds: MCQ answers like "1-b, 2-d, 3-a, 4-c", or numerical-value answers like
"5- 4.50" or "12 - 128" (a plain number instead of a letter).

Rules:
- Output ONLY valid JSON, no markdown fences, no commentary.
- Return an object mapping question number (as string) to an answer, where the answer is either a
  lowercase letter string (for MCQ) or a number (for numerical-value questions), e.g.:
  { "1": "b", "2": "d", "5": 4.5, "12": 128 }
- If explanations are present alongside the answer key, ignore them here (they are handled separately).
- If no answer key is found in this text, return {}.`;

function chunkText(text, chunkSize = 6000, overlap = 300) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start < 0 || end === text.length) break;
  }
  return chunks;
}

function safeParseJSON(raw) {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Try to salvage the largest {...} or [...] block
    const match = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (_) {
        // fall through
      }
    }
    throw new Error("Model did not return valid JSON: " + err.message);
  }
}

async function callClaude(systemPrompt, userText, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userText }],
      });
      const textBlock = response.content.find((b) => b.type === "text");
      return safeParseJSON(textBlock.text);
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastError;
}

/**
 * Main entry point: takes raw extracted text and returns a structured exam.
 * Returns { questions: [...], warnings: [...] }
 */
export async function parseExamFromText(rawText) {
  const warnings = [];
  const chunks = chunkText(rawText);

  // Pass 1: extract questions + options (+ correct_option where inline)
  const allQuestions = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      const result = await callClaude(
        SYSTEM_PROMPT,
        `Chunk ${i + 1} of ${chunks.length} from the source document:\n\n${chunks[i]}`
      );
      if (Array.isArray(result)) {
        allQuestions.push(...result);
      } else {
        warnings.push(`Chunk ${i + 1}: model returned non-array, skipped.`);
      }
    } catch (err) {
      warnings.push(`Chunk ${i + 1}: failed to parse (${err.message}).`);
    }
  }

  // Pass 2: look for an answer-key table anywhere missing an answer is common,
  // by re-scanning the raw text for key-like patterns and asking the model to extract it.
  const needsKey = allQuestions.filter((q) => !q.correct_option && q.numeric_answer == null).length > 0;
  if (needsKey) {
    try {
      const keyMap = await callClaude(
        ANSWER_KEY_PROMPT,
        `Full document text (find the answer key table):\n\n${rawText.slice(0, 20000)}`
      );
      for (const q of allQuestions) {
        const key = keyMap[String(q.question_number)];
        if (key == null) continue;
        if (q.correct_option == null && q.numeric_answer == null) {
          if (typeof key === "number") {
            q.question_type = "numerical";
            q.numeric_answer = key;
          } else {
            q.question_type = q.question_type || "mcq";
            q.correct_option = String(key).toLowerCase();
          }
        }
      }
    } catch (err) {
      warnings.push(`Answer key extraction failed: ${err.message}`);
    }
  }

  // Deduplicate by question_number (keep the most complete version)
  const byNumber = new Map();
  for (const q of allQuestions) {
    if (q.question_number == null) continue;
    const existing = byNumber.get(q.question_number);
    if (!existing) {
      byNumber.set(q.question_number, q);
    } else {
      // prefer the one that has an answer resolved and more options
      const existingScore =
        (existing.correct_option || existing.numeric_answer != null ? 1 : 0) +
        Object.keys(existing.options || {}).length;
      const newScore =
        (q.correct_option || q.numeric_answer != null ? 1 : 0) + Object.keys(q.options || {}).length;
      if (newScore > existingScore) byNumber.set(q.question_number, q);
    }
  }

  const questions = [...byNumber.values()].sort((a, b) => a.question_number - b.question_number);
  return { questions, warnings };
}
