// Client-side OCR fallback for scanned/photographed documents, used when
// there's no real text layer to read (see components/AddClientModal.jsx).
// Everything here runs in the browser/Electron renderer -- no server
// round-trip -- using tesseract.js + pdf.js, both loaded on demand
// (dynamic import) so they never bloat the main app bundle for people who
// never use this. The engine/language files they need are pre-downloaded
// static assets under public/tesseract/ and public/pdfjs/ (not fetched
// from a CDN at runtime) so this keeps working offline after first use
// and doesn't need any CSP exception beyond 'self' -- see index.html and
// vite.config.js's runtimeCaching rule, which caches them after first use.
function assetUrl(relPath){
  return new URL(relPath, document.baseURI).href;
}

const MAX_PDF_PAGES = 5; // a long scanned PDF would otherwise take minutes to OCR

async function renderPdfPagesToCanvases(file){
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = assetUrl('pdfjs/pdf.worker.min.mjs');

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);
  const canvases = [];
  for (let i = 1; i <= pageCount; i++){
    const page = await doc.getPage(i);
    // Upscale — typical phone-scan resolution benefits noticeably from
    // rendering larger than the PDF's own point size before OCR.
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    canvases.push(canvas);
  }
  return canvases;
}

// Recognizes text in a scanned PDF or an image file. onStatus(label,
// progress01) is called repeatedly so the UI can show live feedback —
// this can take anywhere from ~10s to over a minute depending on the
// device and page count.
export async function recognizeDocumentText(file, onStatus){
  const report = (label, progress) => { if (onStatus) onStatus(label, progress); };

  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  report('Preparing document…', 0);
  const images = isPdf ? await renderPdfPagesToCanvases(file) : [file];

  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    workerPath: assetUrl('tesseract/worker.min.js'),
    corePath: assetUrl('tesseract/tesseract-core-simd-lstm.wasm.js'),
    langPath: assetUrl('tesseract/lang/'),
    logger: (m) => {
      if (m.status === 'recognizing text') report('Recognizing text…', m.progress);
      else report('Loading OCR engine…', 0);
    },
  });

  try {
    let text = '';
    for (let i = 0; i < images.length; i++){
      report(`Recognizing text (page ${i + 1} of ${images.length})…`, i / images.length);
      const { data } = await worker.recognize(images[i]);
      text += data.text + '\n';
    }
    return text;
  } finally {
    await worker.terminate();
  }
}
