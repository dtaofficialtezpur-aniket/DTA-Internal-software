import { assetUrl } from '../ocr/runOcr.js';

// Renders page 1 of a PDF to a PNG data URL so it can be shown in an <img>
// -- works the same in the browser and the desktop app, and needs no
// iframe/PDF-viewer plugin or CSP exception (pdf.js and its worker are the
// local copies already used for document autofill).
export async function renderPdfPreview(arrayBuffer, scale = 1.6){
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = assetUrl('pdfjs/pdf.worker.legacy.min.mjs');
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas.toDataURL('image/png');
}
