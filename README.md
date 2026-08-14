# Mock Test Portal

A full-stack mock-exam platform, similar in spirit to TCS iON's test interface:
admins upload a question paper (PDF/DOCX/TXT with an answer key), Claude parses
it into a structured, searchable exam; students browse the exam library, take
the test in a locked-down fullscreen UI (with a numeric keypad for JEE Mains
-style numerical-answer questions), and get an instantly scored result with a
question-by-question review.

## Architecture

```
mocktest-portal/
├── server/     Node.js + Express + PostgreSQL API, Claude-powered PDF parsing
└── client/     React (Vite) frontend — library, upload, locked test UI, results
```

**Flow:** Admin uploads file + names it → server extracts raw text → Claude
structures it into questions/options/answers (in chunks, with a second pass to
match a separate answer-key table) → validation flags anything incomplete →
exam is published (searchable) or marked "needs review" → students search,
start an attempt, take the test in fullscreen with proctoring, submit → server
auto-scores and returns a full breakdown.

## 1. Prerequisites

- Node.js 18+
- PostgreSQL 14+ running locally (or a hosted instance, e.g. Supabase/Railway/Neon)
- An Anthropic API key: https://console.anthropic.com

## 2. Database setup

```bash
# create the database
createdb mocktest_portal
```

## 3. Backend setup

```bash
cd server
npm install
cp .env.example .env
# edit .env: set DATABASE_URL and ANTHROPIC_API_KEY at minimum

npm run db:init     # applies schema.sql — creates all tables
npm run dev          # starts API on http://localhost:4000
```

Check it's alive: `curl http://localhost:4000/api/health` → `{"ok":true}`

## 4. Frontend setup

In a second terminal:

```bash
cd client
npm install
npm run dev           # starts on http://localhost:5173, proxies /api to :4000
```

Open http://localhost:5173.

## 5. Try it end-to-end

1. Go to **Register**, create an account with type **Admin / Test Centre**.
2. Go to **Upload Exam** — upload a sample question paper PDF (questions +
   answer key), give it a name (e.g. "UPUMS 2021 Mock Paper I - PCB"), set
   duration and marking scheme, submit. This calls Claude to parse it — for
   a 30-question paper this usually takes 15–40 seconds.
3. If it published cleanly, go to **Exam Library**, search for it, click
   **Start Test**. You'll get a strict-mode notice, then fullscreen locks in.
4. Answer a few MCQs and, if your paper has numerical-value questions, try
   the on-screen numeric keypad. Use **Mark for Review**, **Save & Next**,
   the palette on the right, then **Submit**.
5. You'll land on the **Results** page with your score and a full review.

## Notes on the AI parsing

- Works out of the box on **text-based PDFs, DOCX, and TXT**. Scanned/photographed
  PDFs return little/no extractable text — `server/src/services/extractText.js`
  has a comment showing exactly where to add an OCR step (e.g. Tesseract.js or
  a cloud OCR API) if you need that.
- Handles both **MCQ** questions and **numerical-answer (JEE Mains-style)**
  questions in the same document — the model auto-detects which type each
  question is. Numerical questions get no negative marking by convention.
- If an answer key is on a separate page/table from the questions (very
  common), a second pass specifically extracts that table and matches it to
  questions by number.
- Anything that fails validation (missing options, no matching correct
  answer, duplicate numbers, etc.) is flagged `needs_review` per-question; the
  whole exam is held back from the public library as `needs_review` status
  until an admin fixes those questions via `PATCH /api/exams/:id/questions/:qid`
  and calls `POST /api/exams/:id/publish`. (A dedicated admin review *UI* for
  this isn't built yet — see "What's not built" below — but the API fully
  supports it.)

## Anti-cheating / "strict exam" behavior

Implemented in `client/src/hooks/useFullscreenLockdown.js`:
- Requests fullscreen on test start; if the student exits fullscreen, a
  blocking overlay appears and it's logged as a violation.
- Detects tab-switch (`visibilitychange`) and window blur.
- Blocks copy/cut, right-click, and common devtools/print/view-source shortcuts.
- Every violation is POSTed to the server and stored in `proctor_events`.
- After 5 violations (configurable via `MAX_VIOLATIONS` in
  `server/src/routes/attempts.js`), the attempt is **auto-submitted** server-side.

This deters casual cheating (tab-switching to search answers, copying
question text out) but — like any browser-based lockdown — a determined user
with OS-level tools (a second device, external screen recording, etc.) can't
be fully stopped by client-side JS alone. For higher-stakes exams you'd pair
this with webcam proctoring or a native lockdown browser, which is a bigger
build.

## What's not built yet (natural next steps)

- An admin **review/edit UI** for `needs_review` questions (the API supports
  it — `PATCH /api/exams/:id/questions/:qid` and `POST /api/exams/:id/publish`
  — but there's no screen for it yet).
- OCR for scanned/image PDFs.
- Resume-after-refresh for an in-progress attempt (currently a hard refresh
  during the test loses local UI state, though answers already saved to the
  server via autosave are safe).
- Section-wise timers (currently one timer for the whole exam, which matches
  the screenshot you shared).
