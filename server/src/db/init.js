import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  await pool.query(sql);
  console.log("Database schema applied successfully.");
  await pool.end();
}

main().catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
