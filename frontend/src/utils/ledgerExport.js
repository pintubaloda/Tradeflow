import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const safeFileName = (name = 'ledger') =>
  String(name || 'ledger')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase() || 'ledger';

const asNumber = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const fmt2 = (n) => asNumber(n).toFixed(2);
const fmtDrCr = (n) => {
  const v = asNumber(n);
  const abs = Math.abs(v).toFixed(2);
  // Tally-style: show Dr for positive, Cr for negative
  return `${abs} ${v >= 0 ? 'Dr' : 'Cr'}`;
};

export const buildRetailerTallyRows = (txns = []) => {
  const sorted = [...txns].sort((a, b) => {
    const da = String(a.txn_date || '').slice(0, 10);
    const db = String(b.txn_date || '').slice(0, 10);
    if (da !== db) return da.localeCompare(db);
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });

  return sorted.map((t) => {
    const debit = asNumber(t.credit_amount);
    const credit = asNumber(t.collected_amount);
    const particulars =
      debit > 0 && credit === 0 ? 'Outstanding Added' :
      credit > 0 && debit === 0 ? 'Collection Received' :
      'Ledger Entry';

    return {
      date: String(t.txn_date || '').slice(0, 10),
      particulars,
      collectedBy: t.collector_name || '',
      debit,
      credit,
      balance: asNumber(t.outstanding_after),
      debitStr: fmt2(debit),
      creditStr: fmt2(credit),
      balanceStr: fmtDrCr(asNumber(t.outstanding_after)),
      mode: t.payment_mode || '',
      notes: t.notes || '',
    };
  });
};

export const buildVendorTallyRows = (txns = []) => {
  const sorted = [...txns].sort((a, b) => {
    const da = String(a.txn_date || '').slice(0, 10);
    const db = String(b.txn_date || '').slice(0, 10);
    if (da !== db) return da.localeCompare(db);
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });

  return sorted.map((t) => {
    const type = t.txn_type || '';
    const amount = asNumber(t.amount);
    const debit = (type === 'advance' || type === 'debit') ? amount : 0;
    const credit = (type === 'credit') ? amount : 0;
    const particulars =
      type === 'advance' ? 'Advance Paid' :
      type === 'debit' ? 'Debit Paid' :
      type === 'credit' ? 'Payment Received' :
      String(type || 'Transaction');

    return {
      date: String(t.txn_date || '').slice(0, 10),
      particulars,
      ref: t.reference_no || '',
      debit,
      credit,
      balance: asNumber(t.closing_balance),
      debitStr: fmt2(debit),
      creditStr: fmt2(credit),
      balanceStr: fmtDrCr(asNumber(t.closing_balance)),
      notes: t.notes || '',
    };
  });
};

export const downloadLedgerXlsx = ({ fileName, sheetName, columns, rows }) => {
  const header = columns.map((c) => c.header);
  const body = rows.map((r) => columns.map((c) => (r[c.key] ?? '')));
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(10, (c.width || c.header.length || 10)) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Ledger');

  const name = safeFileName(fileName || 'ledger');
  XLSX.writeFile(wb, name.endsWith('.xlsx') ? name : `${name}.xlsx`);
};

export const buildLedgerPdfBlob = ({ title, metaLines = [], columns, rows }) => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFontSize(12);
  doc.text(String(title || 'Ledger'), 40, 40);

  doc.setFontSize(9);
  const metaText = (metaLines || []).filter(Boolean).join('  •  ');
  if (metaText) doc.text(metaText, 40, 58);

  autoTable(doc, {
    startY: metaText ? 70 : 60,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => r[c.key] ?? '')),
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [99, 102, 241] }, // violet-ish
    columnStyles: columns.reduce((acc, c, idx) => {
      if (c.align) acc[idx] = { halign: c.align };
      return acc;
    }, {}),
    margin: { left: 40, right: 40 },
  });

  return doc.output('blob');
};

export const downloadLedgerPdf = async ({ fileName, ...opts }) => {
  const blob = buildLedgerPdfBlob(opts);
  const a = document.createElement('a');
  const name = safeFileName(fileName || 'ledger');
  a.href = URL.createObjectURL(blob);
  a.download = name.endsWith('.pdf') ? name : `${name}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
};

export const shareLedgerPdf = async ({ fileName, title, text, ...opts }) => {
  const blob = buildLedgerPdfBlob({ title, ...opts });
  const name = safeFileName(fileName || title || 'ledger');
  const file = new File([blob], name.endsWith('.pdf') ? name : `${name}.pdf`, { type: 'application/pdf' });

  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({
      title: title || 'Ledger',
      text: text || '',
      files: [file],
    });
    return true;
  }
  return false;
};
