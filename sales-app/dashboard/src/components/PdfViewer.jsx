import { useEffect, useRef, useState } from 'react';

// Uses pdf.js's "legacy" build so it also runs on the Chromium inside older Electron versions.
// Reads a PDF that is bundled inside the app (base64). Renders every page with pdf.js, fit to the window width.
// pdf.js is loaded only when this component is opened, and runs without a separate worker file
// (the worker module is imported into the page) so it works in the desktop app, on the web and offline.
let pdfjsPromise;
function loadPdfjs(){
  pdfjsPromise ??= (async () => {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
    globalThis.pdfjsWorker = worker;
    return import('pdfjs-dist/legacy/build/pdf.min.mjs');
  })();
  return pdfjsPromise;
}

const toBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export default function PdfViewer({ base64, filename }){
  const hostRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [state, setState] = useState({ status: 'loading', pages: 0, error: '' });

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    host.innerHTML = '';
    setState({ status: 'loading', pages: 0, error: '' });
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({ data: toBytes(base64), isEvalSupported: false }).promise;
        const width = Math.max(300, Math.min(host.clientWidth || 800, 1100)) * zoom;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= doc.numPages; n++){
          if (cancelled) return;
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
          canvas.style.width = Math.floor(width) + 'px';
          canvas.className = 'pdf-page';
          canvas.setAttribute('aria-label', `Page ${n} of ${doc.numPages}`);
          host.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          if (n === 1) setState({ status: 'ready', pages: doc.numPages, error: '' });
        }
        if (!cancelled) setState({ status: 'ready', pages: doc.numPages, error: '' });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', pages: 0, error: e.message || 'Could not open the PDF.' });
      }
    })();
    return () => { cancelled = true; };
  }, [base64, zoom]);

  function download(){
    const blob = new Blob([toBytes(base64)], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  return (
    <div>
      <div className="pdf-bar">
        <span className="muted small">{state.status === 'loading' ? 'Opening…' : state.pages ? `${state.pages} pages` : ''}</span>
        <div className="pdf-tools">
          <button className="btn" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))} aria-label="Zoom out">−</button>
          <button className="btn" onClick={() => setZoom(1)}>Fit width</button>
          <button className="btn" onClick={() => setZoom((z) => Math.min(2, +(z + 0.2).toFixed(1)))} aria-label="Zoom in">+</button>
          <button className="btn" onClick={download}>Download PDF</button>
        </div>
      </div>
      {state.status === 'error' && <div className="form-error">Could not open the plan: {state.error}</div>}
      <div ref={hostRef} className="pdf-host" />
    </div>
  );
}
