const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function extractPdfText(file: File) {
  if (file.type !== "application/pdf") throw new Error("Use a PDF knowledge document.");
  if (file.size > MAX_PDF_BYTES) throw new Error("Knowledge PDFs must be 10 MB or smaller.");

  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
  }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
  }
  const text = pages.join("\n").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("This PDF has no selectable text. Scanned PDFs need OCR before upload.");
  return text;
}
