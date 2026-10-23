import { PDFDocument as PdfLibDocument } from "pdf-lib";

/**
 * Single entry point for PDF loading. Some tools need to inspect encrypted or
 * partially damaged documents, so the compatibility flag remains centralized.
 */
export const PDFDocument = {
  create: (...args) => PdfLibDocument.create(...args),
  load: (bytes, options = {}) =>
    PdfLibDocument.load(bytes, { ignoreEncryption: true, ...options }),
};
