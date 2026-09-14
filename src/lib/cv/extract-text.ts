export interface ExtractedCvText {
  text: string;
  warnings: string[];
}

/**
 * Extracts plain text from an uploaded CV. PDF and DOCX are fully
 * supported. Legacy .doc (binary Word 97-2003) has no reliable pure-JS
 * extractor, so we're honest about that limitation rather than returning
 * garbled or invented text.
 */
export async function extractCvText(buffer: Buffer, fileType: string, fileName: string): Promise<ExtractedCvText> {
  const type = fileType.toLowerCase();
  const warnings: string[] = [];

  if (type.includes("pdf") || fileName.toLowerCase().endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return { text: result.text, warnings };
  }

  if (type.includes("wordprocessingml") || fileName.toLowerCase().endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, warnings };
  }

  if (fileName.toLowerCase().endsWith(".doc")) {
    warnings.push(
      "Legacy .doc files can't be reliably parsed. Please re-upload your CV as PDF or DOCX for accurate extraction."
    );
    return { text: "", warnings };
  }

  warnings.push(`Unsupported file type "${fileType}". Please upload a PDF or DOCX file.`);
  return { text: "", warnings };
}
