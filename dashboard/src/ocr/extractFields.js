// Mirrors backend/hostinger-php/api.php's CLIENT_DOC_FIELD_LABELS and
// extract_client_fields_from_text() exactly, for text recognized by OCR
// (runOcr.js) instead of a real PDF text layer -- used as a client-side
// fallback so a scanned/photographed document never leaves the browser
// just to have its fields matched. Keep this in sync with the PHP version
// if the label list or normalization rules change there.
const CLIENT_DOC_FIELD_LABELS = {
  subscription: {
    clientName: ['Client Name', 'Client', 'Customer Name', 'Customer', 'Company', 'Company Name', 'Name'],
    softwareName: ['Software Name', 'Software', 'Product', 'Product Name', 'Service'],
    amount: ['Plan Amount', 'Amount', 'Price', 'Fee', 'Subscription Amount'],
    cycle: ['Billing Cycle', 'Cycle'],
    startDate: ['Start Date', 'Date'],
  },
  normal: {
    clientName: ['Client Name', 'Name', 'Customer Name', 'Customer'],
    address: ['Address'],
    contact: ['Contact', 'Contact Details', 'Phone', 'Mobile', 'Email'],
    totalAmount: ['Total Amount', 'Total', 'Amount'],
    advancePayment: ['Advance Payment', 'Advance', 'Paid', 'Amount Paid'],
    notes: ['Notes', 'Remarks', 'Other Details', 'Details'],
  },
};

function escapeRegExp(s){
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractClientFieldsFromText(text, clientType){
  const fields = {};
  const lines = text.split(/\n+/);
  const labelMap = CLIENT_DOC_FIELD_LABELS[clientType] || CLIENT_DOC_FIELD_LABELS.subscription;

  for (const rawLine of lines){
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    for (const field of Object.keys(labelMap)){
      if (fields[field] !== undefined) continue;
      for (const label of labelMap[field]){
        const m = line.match(new RegExp('^' + escapeRegExp(label) + '\\s*[:\\-]\\s*(.+)$', 'i'));
        if (m){
          fields[field] = m[1].trim();
          break;
        }
      }
    }
  }

  if (clientType === 'normal' && !fields.contact){
    const found = [];
    const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (email) found.push(email[0]);
    const phone = text.match(/(?:\+?\d[\d \-]{8,13}\d)/);
    if (phone) found.push(phone[0].trim());
    if (found.length) fields.contact = found.join(', ');
  }

  for (const moneyField of ['amount', 'totalAmount', 'advancePayment']){
    if (fields[moneyField] !== undefined){
      const m = fields[moneyField].match(/\d[\d,]*(?:\.\d+)?/);
      if (m) fields[moneyField] = parseFloat(m[0].replace(/,/g, ''));
      else delete fields[moneyField];
    }
  }

  if (fields.cycle !== undefined){
    const c = fields.cycle.toLowerCase();
    fields.cycle = (c.includes('year') || c.includes('annual')) ? 'Annual' : 'Monthly';
  }

  if (fields.startDate !== undefined){
    const ts = Date.parse(fields.startDate);
    if (Number.isNaN(ts)) delete fields.startDate;
    else fields.startDate = new Date(ts).toISOString().slice(0, 10);
  }

  return fields;
}
