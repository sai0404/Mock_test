import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import { authRouter } from "./routes/auth.js";
import { examsRouter } from "./routes/exams.js";
import { attemptsRouter } from "./routes/attempts.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/exams", examsRouter);
app.use("/api/attempts", attemptsRouter);

// Central error handler (e.g. multer file-size/type errors)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Mock Test Portal API running on http://localhost:${PORT}`));
