import fs from "fs/promises";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";

/**
 * Extracts raw text from an uploaded file buffer, based on its mimetype/extension.
 * Returns { text, pageCount }.
 *
 * NOTE: This only handles text-based PDFs and DOCX out of the box.
 * Scanned/image PDFs will return little or no text — in that case
 * `text.length` will be suspiciously small relative to `pageCount`,
 * which is used as a signal to flag the exam for manual review
 * (see services/parseExam.js). To support scanned PDFs, plug an OCR
 * step (e.g. Tesseract.js or a cloud OCR API) in here before pdfParse.
 */
export async function extractText(filePath, mimetype, originalName) {
  const buffer = await fs.readFile(filePath);

  if (mimetype === "application/pdf" || originalName.toLowerCase().endsWith(".pdf")) {
    const data = await pdfParse(buffer);
    return { text: data.text, pageCount: data.numpages };
  }

  if (
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    originalName.toLowerCase().endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, pageCount: null };
  }

  if (mimetype === "text/plain" || originalName.toLowerCase().endsWith(".txt")) {
    return { text: buffer.toString("utf-8"), pageCount: null };
  }

  throw new Error(`Unsupported file type: ${mimetype || originalName}`);
}
