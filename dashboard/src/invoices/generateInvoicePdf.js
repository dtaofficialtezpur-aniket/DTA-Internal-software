import logoUrl from '../assets/dta-logo.png';
import { fmtDate } from '../utils.js';

// jsPDF pulls in html2canvas + dompurify as part of its own bundle (for
// its .html() method, which isn't used here) — dynamic import keeps that
// ~350KB out of the main app bundle for everyone who never generates an
// invoice, loading it only when this function actually runs.
async function loadJsPdf(){
  const { jsPDF } = await import('jspdf');
  return jsPDF;
}

// jsPDF's built-in fonts (helvetica/times/courier) only cover WinAnsi/
// Latin-1 — the ₹ symbol used everywhere else in the app (utils.js's
// fmtMoney) would render as a missing-glyph box here, so invoices use
// "Rs." instead rather than embedding a whole Unicode font just for one
// symbol.
function fmtMoneyPdf(n){
  return 'Rs. ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

let logoDataUrlPromise = null;
function loadLogoDataUrl(){
  if (!logoDataUrlPromise){
    logoDataUrlPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = logoUrl;
    });
  }
  return logoDataUrlPromise;
}

// Builds the invoice PDF and returns the jsPDF document — the caller
// decides what to do with it (.save(filename) to download, or nothing
// further if just previewing). Used both right after generating a new
// invoice and when re-downloading a previously saved one, so it only
// ever takes the plain invoice/client data, never anything from a form.
export async function buildInvoicePdf(invoice, billTo){
  const jsPDF = await loadJsPdf();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;

  try {
    const logo = await loadLogoDataUrl();
    doc.addImage(logo, 'PNG', margin, 15, 20, 20);
  } catch {
    // Logo failing to load shouldn't block producing the invoice.
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('DTA', margin + 25, 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Digital department', margin + 25, 31);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('INVOICE', pageWidth - margin, 24, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(invoice.number, pageWidth - margin, 31, { align: 'right' });
  doc.text(fmtDate(new Date(invoice.issuedAt)), pageWidth - margin, 36, { align: 'right' });

  doc.setDrawColor(210);
  doc.line(margin, 44, pageWidth - margin, 44);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Bill To', margin, 54);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let y = 60;
  doc.text(billTo.name, margin, y);
  for (const line of billTo.extraLines || []){
    y += 5;
    doc.text(line, margin, y);
  }

  const tableTop = y + 14;
  doc.setFillColor(15, 22, 33);
  doc.setTextColor(255, 255, 255);
  doc.rect(margin, tableTop, pageWidth - margin * 2, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Description', margin + 3, tableTop + 5.5);
  doc.text('Amount', pageWidth - margin - 3, tableTop + 5.5, { align: 'right' });

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  const rowY = tableTop + 16;
  doc.text(invoice.description || 'Services rendered', margin + 3, rowY);
  doc.text(fmtMoneyPdf(invoice.amount), pageWidth - margin - 3, rowY, { align: 'right' });
  doc.setDrawColor(230);
  doc.line(margin, rowY + 5, pageWidth - margin, rowY + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total', margin + 3, rowY + 16);
  doc.text(fmtMoneyPdf(invoice.amount), pageWidth - margin - 3, rowY + 16, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text('Thank you for your business.', margin, 280);

  return doc;
}

export async function downloadInvoicePdf(invoice, billTo){
  const doc = await buildInvoicePdf(invoice, billTo);
  doc.save(`${invoice.number}.pdf`);
}
