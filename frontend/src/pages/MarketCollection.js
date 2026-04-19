import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { collectionAPI } from '../services/api';
import {
  Button, Input, Select, Modal, Badge, Table, StatCard, Card,
  EmptyState, useToast, Toast, Spinner, Avatar, ConfirmDialog
} from '../components/common';
import { formatCurrency, formatDate, today, paymentModeLabel, debounce } from '../utils/helpers';
import { useWebSocket } from '../hooks/useWebSocket';
import { buildRetailerTallyRows, downloadLedgerXlsx, downloadLedgerPdf, shareLedgerPdf } from '../utils/ledgerExport';

function RetailerModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState({ name: '', ownerName: '', phone: '', address: '', area: '', creditLimit: '' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const toast = useToast();

  useEffect(() => {
    if (initial) setForm({ name: initial.name, ownerName: initial.owner_name||'', phone: initial.phone||'', address: initial.address||'', area: initial.area||'', creditLimit: initial.credit_limit||'' });
    else setForm({ name: '', ownerName: '', phone: '', address: '', area: '', creditLimit: '' });
    setErrors({});
  }, [initial, open]);

  const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })), error: errors[k] });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErrors({ name: 'Name required' }); return; }
    setLoading(true);
    try { await onSave(form); onClose(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Retailer' : 'Add Retailer'} size="md"
      footer={<>
        <Button variant="default" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={loading} onClick={submit}>{initial ? 'Save' : 'Add retailer'}</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Shop / Business name *" placeholder="Ganesh General Store" {...f('name')} autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Owner name" placeholder="Ganesh Patil" {...f('ownerName')} />
          <Input label="Phone" placeholder="+91 98765…" {...f('phone')} type="tel" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Area" placeholder="Shivajinagar" {...f('area')} />
          <Input label="Credit limit (₹)" type="number" min="0" step="0.01" placeholder="50000" prefix="₹" {...f('creditLimit')} />
        </div>
        <Input label="Address" placeholder="Full address" {...f('address')} />
      </form>
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </Modal>
  );
}

function CollectionModal({ open, onClose, onSave, retailers, agents }) {
  const [form, setForm] = useState({ retailerId: '', txnDate: today(), creditAmount: '0', collectedAmount: '', paymentMode: 'cash', referenceNo: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const toast = useToast();

  useEffect(() => {
    setForm({ retailerId: '', txnDate: today(), creditAmount: '0', collectedAmount: '', paymentMode: 'cash', referenceNo: '', notes: '' });
    setErrors({});
  }, [open]);

  const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })), error: errors[k] });

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.retailerId) errs.retailerId = 'Select retailer';
    if (!form.collectedAmount || parseFloat(form.collectedAmount) <= 0) errs.collectedAmount = 'Enter amount';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try { await onSave(form); onClose(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };

  const selectedRetailer = retailers.find(r => r.id === form.retailerId);

  return (
    <Modal open={open} onClose={onClose} title="Record Collection" size="md"
      footer={<>
        <Button variant="default" onClick={onClose}>Cancel</Button>
        <Button variant="success" loading={loading} onClick={submit}>Record collection</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <Select label="Retailer *" {...f('retailerId')}>
          <option value="">— Select retailer —</option>
          {retailers.map(r => (
            <option key={r.id} value={r.id}>{r.name} {r.area ? `(${r.area})` : ''}</option>
          ))}
        </Select>
        {selectedRetailer && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs">
            <p className="font-medium text-amber-800">Outstanding: <span className="text-red-600">{formatCurrency(selectedRetailer.current_outstanding)}</span></p>
            <p className="text-amber-600">Credit limit: {formatCurrency(selectedRetailer.credit_limit)}</p>
          </div>
        )}
        <Input label="Date *" type="date" {...f('txnDate')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Credit given (₹)" type="number" min="0" step="0.01" placeholder="0.00" prefix="₹" {...f('creditAmount')} disabled />
          <Input label="Amount collected (₹) *" type="number" min="0" step="0.01" placeholder="0.00" prefix="₹" {...f('collectedAmount')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Payment mode" {...f('paymentMode')}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="cheque">Cheque</option>
            <option value="bank">Bank Transfer</option>
          </Select>
          <Input label="Reference / Cheque no." placeholder="Optional" {...f('referenceNo')} />
        </div>
        <Input label="Notes" placeholder="Optional" {...f('notes')} />
      </form>
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </Modal>
  );
}

function ExecutiveDepositModal({ open, onClose, onSave, executives, initialExecutiveId }) {
  const [form, setForm] = useState({ executiveUserId: '', depositDate: today(), amount: '', paymentMode: 'cash', notes: '' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const toast = useToast();

  useEffect(() => {
    setForm({
      executiveUserId: initialExecutiveId || '',
      depositDate: today(),
      amount: '',
      paymentMode: 'cash',
      notes: '',
    });
    setErrors({});
  }, [open, initialExecutiveId]);

  const f = (k) => ({ value: form[k], onChange: (e) => setForm((p) => ({ ...p, [k]: e.target.value })), error: errors[k] });

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.executiveUserId) errs.executiveUserId = 'Select executive';
    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = 'Enter amount';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      await onSave({
        executiveUserId: form.executiveUserId,
        depositDate: form.depositDate,
        amount: parseFloat(form.amount),
        paymentMode: form.paymentMode,
        notes: form.notes,
      });
      toast.success('Deposit recorded');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record deposit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record Executive Deposit"
      size="md"
      footer={<>
        <Button variant="default" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={loading} onClick={submit}>Save</Button>
      </>}
    >
      <form onSubmit={submit} className="space-y-3">
        <Select label="Executive *" {...f('executiveUserId')}>
          <option value="">â€” Select executive â€”</option>
          {(executives || []).map((x) => (
            <option key={x.id} value={x.id}>{x.full_name}</option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date *" type="date" {...f('depositDate')} />
          <Input label="Amount (â‚¹) *" type="number" min="0" step="0.01" prefix="â‚¹" placeholder="0.00" {...f('amount')} />
        </div>
        <Select label="Payment mode" {...f('paymentMode')}>
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="cheque">Cheque</option>
          <option value="bank">Bank Transfer</option>
        </Select>
        <Input label="Notes" placeholder="Optional" {...f('notes')} />
      </form>
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </Modal>
  );
}

function RetailerLedgerModal({ open, onClose, firmId, retailer }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [txns, setTxns] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editTxn, setEditTxn] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editErrors, setEditErrors] = useState({});
  const [editForm, setEditForm] = useState({ txnDate: today(), creditAmount: '0', collectedAmount: '0', paymentMode: 'cash', referenceNo: '', notes: '' });
  const [deleteTxn, setDeleteTxn] = useState(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState('pdf'); // pdf | xlsx
  const toast = useToast();
  const lastErrorAtRef = React.useRef(0);
  const syncRef = React.useRef({ inFlight: false, lastAt: 0, timer: null });
  const retailerId = retailer?.id || null;
  const loadRef = React.useRef(null);

  const LIMIT = 100;

  const fetchPage = useCallback(async (pageToLoad) => {
    const res = await collectionAPI.list(firmId, {
      retailerId,
      from: from || undefined,
      to: to || undefined,
      limit: LIMIT,
      page: pageToLoad,
    });
    return res.data.transactions || [];
  }, [firmId, retailerId, from, to]);

  const load = useCallback(async () => {
    if (!open || !retailerId || !firmId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const rows = await fetchPage(1);
      setTxns(rows);
      setPage(1);
      setHasMore(rows.length === LIMIT);
    } catch (err) {
      setLoadError(true);
      const now = Date.now();
      if (now - lastErrorAtRef.current > 2000) {
        toast.error(err.response?.data?.error || 'Failed to load retailer ledger');
        lastErrorAtRef.current = now;
      }
    } finally { setLoading(false); }
  }, [open, retailerId, firmId, fetchPage, toast]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const rows = await fetchPage(nextPage);
      setTxns(prev => [...prev, ...rows]);
      setPage(nextPage);
      setHasMore(rows.length === LIMIT);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load more');
    } finally { setLoadingMore(false); }
  }, [loadingMore, loading, hasMore, page, fetchPage, toast]);

  useEffect(() => { loadRef.current = load; }, [load]);

  // Load once on open or retailer switch.
  // Do NOT auto-reload on every parent re-render (live list refresh) or while user adjusts date filters.
  useEffect(() => {
    if (!open || !retailerId || !firmId) return;
    loadRef.current?.();
  }, [open, retailerId, firmId]);

  useEffect(() => {
    if (!editOpen || !editTxn) return;
    setEditErrors({});
    setEditForm({
      txnDate: (editTxn.txn_date || today()).slice(0, 10),
      creditAmount: String(editTxn.credit_amount ?? '0'),
      collectedAmount: String(editTxn.collected_amount ?? '0'),
      paymentMode: editTxn.payment_mode || 'cash',
      referenceNo: editTxn.reference_no || '',
      notes: editTxn.notes || '',
    });
  }, [editOpen, editTxn]);

  const ledgerTitle = `Retailer Ledger — ${retailer?.name || ''}`;
  const rangeLabel = `${from || 'All'} → ${to || 'All'}`;

  const tallyRows = buildRetailerTallyRows(txns);
  const exportColumns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Particulars', key: 'particulars', width: 24 },
    { header: 'Collected By', key: 'collectedBy', width: 18 },
    { header: 'Debit (DR)', key: 'debitStr', width: 12, align: 'right' },
    { header: 'Credit (CR)', key: 'creditStr', width: 12, align: 'right' },
    { header: 'Balance', key: 'balanceStr', width: 12, align: 'right' },
    { header: 'Mode', key: 'mode', width: 10 },
    { header: 'Notes', key: 'notes', width: 24 },
  ];

  const downloadXls = () => {
    downloadLedgerXlsx({
      fileName: `${retailer?.name || 'retailer'}-ledger.xlsx`,
      sheetName: 'Retailer Ledger',
      columns: exportColumns,
      rows: tallyRows,
    });
  };

  const downloadPdf = async () => {
    try {
      await downloadLedgerPdf({
        fileName: `${retailer?.name || 'retailer'}-ledger.pdf`,
        title: ledgerTitle,
        metaLines: [rangeLabel],
        columns: exportColumns,
        rows: tallyRows,
      });
    } catch (_) {
      toast.error('Failed to generate PDF');
    }
  };

  const shareLedger = async () => {
    try {
      const ok = await shareLedgerPdf({
        fileName: `${retailer?.name || 'retailer'}-ledger.pdf`,
        title: ledgerTitle,
        text: rangeLabel,
        metaLines: [rangeLabel],
        columns: exportColumns,
        rows: tallyRows,
      });
      if (ok) return;

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${ledgerTitle}\n${rangeLabel}\n${window.location.href}`);
        toast.success('Ledger link copied (PDF share not supported on this device)');
        return;
      }
      toast.info(`${ledgerTitle}\n${rangeLabel}`);
    } catch (_) {
      toast.error('Share failed');
    }
  };

  const scheduleSync = useCallback(() => {
    const s = syncRef.current;
    const now = Date.now();
    const minGap = 1500;
    const run = async () => {
      if (s.inFlight) return;
      s.inFlight = true;
      try { await loadRef.current?.(); } finally { s.lastAt = Date.now(); s.inFlight = false; }
    };

    const elapsed = now - s.lastAt;
    if (elapsed >= minGap) {
      run();
      return;
    }
    if (s.timer) return;
    s.timer = setTimeout(() => {
      s.timer = null;
      run();
    }, minGap - elapsed);
  }, []);

  const onWsMessage = useCallback((msg) => {
    if (!open || !retailerId) return;
    if (['collection_added', 'collection_updated', 'collection_deleted'].includes(msg?.event) && msg?.data?.retailer_id === retailerId) {
      scheduleSync();
    }
  }, [open, retailerId, scheduleSync]);

  useWebSocket({
    tenantId: user?.tenantId,
    firmId,
    enabled: !!open && !!retailerId && !!firmId,
    onMessage: onWsMessage,
  });

  const totals = txns.reduce((acc, t) => {
    acc.credit += parseFloat(t.credit_amount) || 0;
    acc.collected += parseFloat(t.collected_amount) || 0;
    return acc;
  }, { credit: 0, collected: 0 });

  const latestTxnId = txns?.length ? txns[0].id : null;
  const canModifyTxn = (t) => {
    if (!t?.id || t.id !== latestTxnId) return false;
    if (user?.role === 'viewer') return false;
    if (user?.role === 'collection_boy') {
      if (t.collected_by !== user?.id) return false;
      if ((parseFloat(t.credit_amount) || 0) > 0) return false;
    }
    return true;
  };

  const handleSaveTxn = async (payload) => {
    if (!editTxn) return;
    try {
      await collectionAPI.updateTxn(firmId, editTxn.id, payload);
      toast.success('Transaction updated');
      setEditOpen(false);
      setEditTxn(null);
      scheduleSync();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update transaction');
    }
  };

  const handleDeleteTxn = async () => {
    if (!deleteTxn) return;
    try {
      await collectionAPI.deleteTxn(firmId, deleteTxn.id);
      toast.success('Transaction deleted');
      setDeleteTxn(null);
      scheduleSync();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete transaction');
    }
  };

  const submitEdit = async () => {
    const errs = {};
    if (!editForm.txnDate) errs.txnDate = 'Date required';
    const credit = user?.role === 'collection_boy' ? 0 : (parseFloat(editForm.creditAmount) || 0);
    const collected = parseFloat(editForm.collectedAmount) || 0;
    if (credit < 0) errs.creditAmount = 'Must be >= 0';
    if (collected < 0) errs.collectedAmount = 'Must be >= 0';
    if (credit === 0 && collected === 0) errs.collectedAmount = 'Enter credit or collected amount';
    setEditErrors(errs);
    if (Object.keys(errs).length) return;

    setEditSaving(true);
    try {
      await handleSaveTxn({
        txnDate: editForm.txnDate,
        creditAmount: credit,
        collectedAmount: collected,
        paymentMode: editForm.paymentMode,
        referenceNo: editForm.referenceNo,
        notes: editForm.notes,
      });
    } finally {
      setEditSaving(false);
    }
  };

  const cols = [
    { key: 'txn_date', label: 'Date', render: v => formatDate(v) },
    {
      key: '_particulars',
      label: 'Particulars',
      render: (_, r) => {
        const dr = parseFloat(r.credit_amount) || 0;
        const cr = parseFloat(r.collected_amount) || 0;
        const p = dr > 0 && cr === 0 ? 'Outstanding Added' : cr > 0 && dr === 0 ? 'Collection Received' : 'Ledger Entry';
        return <span className="text-slate-700">{p}</span>;
      },
    },
    { key: 'collector_name', label: 'Collected by', render: (v) => (
      <div className="flex items-center gap-1.5"><Avatar name={v} size="sm" /><span>{v}</span></div>
    )},
    { key: 'credit_amount', label: 'DR', render: v => (parseFloat(v) || 0) > 0 ? <span className="text-amber-600 tabular-nums">{formatCurrency(v)}</span> : '—' },
    { key: 'collected_amount', label: 'CR', render: v => (parseFloat(v) || 0) > 0 ? <span className="text-emerald-600 font-semibold tabular-nums">{formatCurrency(v)}</span> : '—' },
    { key: 'outstanding_after', label: 'Balance', render: (v) => {
      const n = parseFloat(v) || 0;
      const suffix = n >= 0 ? 'Dr' : 'Cr';
      return (
        <span className={`tabular-nums font-medium ${n > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
          {formatCurrency(Math.abs(n))} {suffix}
        </span>
      );
    }},
    { key: 'payment_mode', label: 'Mode', render: v => <Badge color="gray">{paymentModeLabel(v)}</Badge> },
    { key: 'notes', label: 'Notes', render: v => <span className="text-slate-400 text-xs">{v || '—'}</span> },
    {
      key: '_actions',
      label: '',
      className: 'text-right',
      cellClass: 'text-right',
      render: (_, r) => (
        <div className="flex items-center justify-end gap-1">
          {canModifyTxn(r) && (
            <>
              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditTxn(r); setEditOpen(true); }}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDeleteTxn(r); }}>Delete</Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <Modal open={open} onClose={onClose} title={ledgerTitle} size="xl"
      footer={<div className="w-full flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="default" onClick={scheduleSync} disabled={loading}>Sync</Button>
          <Button variant="default" onClick={shareLedger} disabled={loading}>Share</Button>
          <Button variant="default" onClick={() => setDownloadOpen(true)} disabled={loading || !txns?.length}>Download</Button>
        </div>
        <Button variant="default" onClick={onClose}>Close</Button>
      </div>}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Current outstanding" value={formatCurrency(retailer?.current_outstanding || 0)} color="red" icon="📋" />
        <StatCard label="Credit (range)" value={formatCurrency(totals.credit)} color="amber" icon="➕" />
        <StatCard label="Collected (range)" value={formatCurrency(totals.collected)} color="green" icon="💰" />
        <StatCard label="Transactions" value={txns.length} icon="🧾" />
      </div>

      <div className="flex gap-2 mb-4">
        <Input type="date" value={from} onChange={e => setFrom(e.target.value)} wrapperClass="flex-1" label="From" />
        <Input type="date" value={to} onChange={e => setTo(e.target.value)} wrapperClass="flex-1" label="To" />
        <Button variant="default" onClick={load}>Filter</Button>
      </div>

      {loading ? <div className="flex justify-center py-8"><Spinner /></div> : loadError ? (
        <div className="flex flex-col items-center py-8 gap-3">
          <p className="text-sm text-slate-500">Failed to load retailer ledger.</p>
          <Button size="sm" variant="default" onClick={scheduleSync}>Retry</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Table columns={cols} rows={txns} empty="No transactions for this retailer" />
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="default" loading={loadingMore} onClick={loadMore}>Load more</Button>
            </div>
          )}
          {!hasMore && txns.length >= LIMIT && (
            <p className="text-xs text-slate-400 text-center">End of results (use date filter for older entries).</p>
          )}
        </div>
      )}

      <Modal
        open={downloadOpen}
        onClose={() => setDownloadOpen(false)}
        title="Download ledger"
        size="sm"
        footer={<>
          <Button variant="default" onClick={() => setDownloadOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => {
            setDownloadOpen(false);
            if (downloadFormat === 'xlsx') downloadXls();
            else downloadPdf();
          }}>Download</Button>
        </>}
      >
        <Select label="Format" value={downloadFormat} onChange={e => setDownloadFormat(e.target.value)}>
          <option value="pdf">PDF</option>
          <option value="xlsx">Excel (.xlsx)</option>
        </Select>
        <p className="text-xs text-slate-400 mt-2">PDF uses the browser print dialog.</p>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditTxn(null); }}
        title="Edit transaction"
        size="md"
        footer={<>
          <Button variant="default" onClick={() => { setEditOpen(false); setEditTxn(null); }}>Cancel</Button>
          <Button variant="primary" loading={editSaving} onClick={submitEdit}>Save</Button>
        </>}
      >
        <div className="space-y-3">
          <Input label="Date" type="date" value={editForm.txnDate} onChange={e => setEditForm(p => ({ ...p, txnDate: e.target.value }))} error={editErrors.txnDate} />
          {user?.role !== 'collection_boy' && (
            <Input label="Credit (₹)" type="number" min="0" step="0.01"
              value={editForm.creditAmount}
              onChange={e => setEditForm(p => ({ ...p, creditAmount: e.target.value }))}
              error={editErrors.creditAmount}
              prefix="₹"
            />
          )}
          <Input label="Collected (₹)" type="number" min="0" step="0.01"
            value={editForm.collectedAmount}
            onChange={e => setEditForm(p => ({ ...p, collectedAmount: e.target.value }))}
            error={editErrors.collectedAmount}
            prefix="₹"
          />
          <Select label="Payment mode" value={editForm.paymentMode} onChange={e => setEditForm(p => ({ ...p, paymentMode: e.target.value }))}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="cheque">Cheque</option>
            <option value="bank">Bank</option>
            <option value="credit">Credit</option>
          </Select>
          <Input label="Reference no." value={editForm.referenceNo} onChange={e => setEditForm(p => ({ ...p, referenceNo: e.target.value }))} />
          <Input label="Notes" value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} />
          <p className="text-xs text-slate-400">Only the most recent transaction can be edited to preserve ledger integrity.</p>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTxn}
        onClose={() => setDeleteTxn(null)}
        onConfirm={handleDeleteTxn}
        title="Delete transaction?"
        message="This will delete the most recent transaction and update the retailer outstanding balance. This action cannot be undone."
        confirmLabel="Delete"
        danger
      />

      <Toast toasts={toast.toasts} remove={toast.remove} />
    </Modal>
  );
}

function OutstandingModal({ open, onClose, onSave, retailers }) {
  const [form, setForm] = useState({ retailerId: '', txnDate: today(), creditAmount: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const toast = useToast();

  useEffect(() => {
    setForm({ retailerId: '', txnDate: today(), creditAmount: '', notes: '' });
    setErrors({});
  }, [open]);

  const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })), error: errors[k] });

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.retailerId) errs.retailerId = 'Select retailer';
    if (!form.creditAmount || parseFloat(form.creditAmount) <= 0) errs.creditAmount = 'Enter credit amount';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try { await onSave(form); onClose(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };

  const selectedRetailer = retailers.find(r => r.id === form.retailerId);

  return (
    <Modal open={open} onClose={onClose} title="Add Outstanding (Credit)" size="md"
      footer={<>
        <Button variant="default" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={loading} onClick={submit}>Add outstanding</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <Select label="Retailer *" {...f('retailerId')}>
          <option value="">— Select retailer —</option>
          {retailers.map(r => (
            <option key={r.id} value={r.id}>{r.name} {r.area ? `(${r.area})` : ''}</option>
          ))}
        </Select>
        {selectedRetailer && (
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs">
            <p className="font-medium text-slate-700">Current outstanding: <span className="text-red-600">{formatCurrency(selectedRetailer.current_outstanding)}</span></p>
            <p className="text-slate-500">This will increase outstanding.</p>
          </div>
        )}
        <Input label="Date *" type="date" {...f('txnDate')} />
        <Input label="Credit given (₹) *" type="number" min="0" step="0.01" placeholder="0.00" prefix="₹" {...f('creditAmount')} />
        <Input label="Notes" placeholder="Optional" {...f('notes')} />
      </form>
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </Modal>
  );
}

export default function MarketCollection() {
  const { user, currentFirm, hasModule, isAdmin } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('overview'); // overview | retailers | transactions | executives
  const [retailers, setRetailers] = useState([]);
  const [outstanding, setOutstanding] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [agents, setAgents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retailerModal, setRetailerModal] = useState(false);
  const [editRetailer, setEditRetailer] = useState(null);
  const [collectionModal, setCollectionModal] = useState(false);
  const [outstandingModal, setOutstandingModal] = useState(false);
  const [ledgerRetailer, setLedgerRetailer] = useState(null);
  const [searchRetailer, setSearchRetailer] = useState('');
  const [loadError, setLoadError] = useState(false);

  const canViewExecutives = ['tenant_admin', 'firm_admin', 'accountant', 'viewer'].includes(user?.role);
  const canRecordDeposits = ['tenant_admin', 'firm_admin', 'accountant'].includes(user?.role);
  const [execFrom, setExecFrom] = useState(today());
  const [execTo, setExecTo] = useState(today());
  const [execLoading, setExecLoading] = useState(false);
  const [execLoadError, setExecLoadError] = useState(false);
  const [execSummary, setExecSummary] = useState([]);
  const [execDeposits, setExecDeposits] = useState([]);
  const [depositModal, setDepositModal] = useState(false);
  const [depositExecId, setDepositExecId] = useState('');

  const loadAll = useCallback(async ({ silent = false } = {}) => {
    if (!currentFirm) return;
    if (!silent) setLoading(true);
    setLoadError(false);
    try {
      const [rRes, cRes, aRes, oRes] = await Promise.all([
        collectionAPI.listRetailers(currentFirm.id),
        collectionAPI.list(currentFirm.id),
        collectionAPI.agents(currentFirm.id),
        collectionAPI.outstanding(currentFirm.id),
      ]);
      setRetailers(rRes.data.retailers || []);
      setTransactions(cRes.data.transactions || []);
      setSummary(cRes.data.summary);
      setAgents(aRes.data || []);
      setOutstanding(oRes.data || []);
    } catch (_) {
      setLoadError(true);
    } finally { if (!silent) setLoading(false); }
  }, [currentFirm]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadExecutives = useCallback(async ({ silent = false } = {}) => {
    if (!currentFirm) return;
    setExecLoadError(false);
    if (!silent) setExecLoading(true);
    try {
      const [sRes, dRes] = await Promise.all([
        collectionAPI.executiveSummary(currentFirm.id, { from: execFrom, to: execTo }),
        collectionAPI.listExecutiveDeposits(currentFirm.id, { from: execFrom, to: execTo }),
      ]);
      setExecSummary(sRes.data.executives || []);
      setExecDeposits(dRes.data.deposits || []);
    } catch (_) {
      setExecLoadError(true);
    } finally {
      if (!silent) setExecLoading(false);
    }
  }, [currentFirm, execFrom, execTo]);

  useEffect(() => {
    if (tab === 'executives' && canViewExecutives) loadExecutives();
  }, [tab, canViewExecutives, loadExecutives]);

  const syncAllRef = React.useRef({ inFlight: false, lastAt: 0, timer: null });
  const scheduleLoadAll = useCallback(() => {
    const s = syncAllRef.current;
    const now = Date.now();
    const minGap = 1500;
    const run = async () => {
      if (s.inFlight) return;
      s.inFlight = true;
      try { await loadAll({ silent: true }); } finally { s.lastAt = Date.now(); s.inFlight = false; }
    };
    const elapsed = now - s.lastAt;
    if (elapsed >= minGap) { run(); return; }
    if (s.timer) return;
    s.timer = setTimeout(() => { s.timer = null; run(); }, minGap - elapsed);
  }, [loadAll]);

  const syncExecRef = React.useRef({ inFlight: false, lastAt: 0, timer: null });
  const scheduleLoadExecutives = useCallback(() => {
    const s = syncExecRef.current;
    const now = Date.now();
    const minGap = 2500;
    const run = async () => {
      if (s.inFlight) return;
      s.inFlight = true;
      try { await loadExecutives({ silent: true }); } finally { s.lastAt = Date.now(); s.inFlight = false; }
    };
    const elapsed = now - s.lastAt;
    if (elapsed >= minGap) { run(); return; }
    if (s.timer) return;
    s.timer = setTimeout(() => { s.timer = null; run(); }, minGap - elapsed);
  }, [loadExecutives]);

  useWebSocket({
    tenantId: user?.tenantId,
    firmId: currentFirm?.id,
    enabled: !!currentFirm && hasModule('market_collection'),
    onMessage: (msg) => {
      if (['collection_added', 'collection_updated', 'collection_deleted'].includes(msg?.event)) scheduleLoadAll();
      if (tab === 'executives' && ['collection_added', 'collection_updated', 'collection_deleted'].includes(msg?.event)) scheduleLoadExecutives();
    },
  });

  const handleSaveRetailer = async (form) => {
    if (editRetailer) {
      await collectionAPI.updateRetailer(currentFirm.id, editRetailer.id, form);
      toast.success('Retailer updated');
    } else {
      await collectionAPI.createRetailer(currentFirm.id, form);
      toast.success('Retailer added');
    }
    loadAll();
  };

  const handleAddCollection = async (form) => {
    await collectionAPI.add(currentFirm.id, {
      retailerId: form.retailerId, txnDate: form.txnDate,
      creditAmount: 0,
      collectedAmount: parseFloat(form.collectedAmount) || 0,
      paymentMode: form.paymentMode, referenceNo: form.referenceNo, notes: form.notes,
    });
    toast.success('Collection recorded');
    loadAll();
  };

  const canPostOutstanding = isAdmin || user?.role === 'accountant';
  const handleAddOutstanding = async (form) => {
    await collectionAPI.add(currentFirm.id, {
      retailerId: form.retailerId, txnDate: form.txnDate,
      creditAmount: parseFloat(form.creditAmount) || 0,
      collectedAmount: 0,
      paymentMode: 'credit',
      notes: form.notes,
    });
    toast.success('Outstanding added');
    loadAll();
  };

  const filteredRetailers = retailers.filter(r =>
    !searchRetailer || r.name.toLowerCase().includes(searchRetailer.toLowerCase()) || (r.area || '').toLowerCase().includes(searchRetailer.toLowerCase())
  );

  if (!hasModule('market_collection')) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <p className="text-2xl mb-3">🤝</p>
        <p className="font-semibold text-slate-700 mb-1">Market Collection not enabled</p>
        <p className="text-sm text-slate-400 mb-4">Track retailer credit & real-time agent collections</p>
        <Button variant="primary" onClick={() => window.location.href = '/subscriptions'}>Enable for ₹499/month</Button>
      </div>
    </div>
  );

  const outstandingCols = [
    { key: 'name', label: 'Retailer', render: (v, r) => (
      <div><p className="font-medium text-slate-800">{v}</p><p className="text-xs text-slate-400">{r.area || '—'}</p></div>
    )},
    { key: 'phone', label: 'Phone', render: v => v || '—' },
    { key: 'credit_limit', label: 'Credit Limit', render: v => formatCurrency(v) },
    { key: 'current_outstanding', label: 'Outstanding', render: v => (
      <span className={`font-semibold tabular-nums ${parseFloat(v) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(v)}</span>
    )},
    { key: 'utilization_pct', label: 'Utilization', render: v => (
      <div className="flex items-center gap-2">
        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.min(v, 100)}%`, background: v > 80 ? '#ef4444' : v > 50 ? '#f59e0b' : '#10b981' }} />
        </div>
        <span className="text-xs tabular-nums">{v}%</span>
      </div>
    )},
    { key: 'last_txn_date', label: 'Last txn', render: v => formatDate(v) },
    { key: 'actions', label: '', render: (_, r) => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setLedgerRetailer(r); }}>Ledger</Button>
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditRetailer(r); setRetailerModal(true); }}>Edit</Button>
      </div>
    )},
  ];

  const txnCols = [
    { key: 'txn_date', label: 'Date', render: v => formatDate(v) },
    { key: 'retailer_name', label: 'Retailer' },
    { key: 'area', label: 'Area', render: v => v || '—' },
    { key: 'collector_name', label: 'Agent', render: (v) => (
      <div className="flex items-center gap-1.5"><Avatar name={v} size="sm" /><span>{v}</span></div>
    )},
    { key: 'credit_amount', label: 'Credit given', render: v => v > 0 ? <span className="text-amber-600 tabular-nums">{formatCurrency(v)}</span> : '—' },
    { key: 'collected_amount', label: 'Collected', render: v => <span className="text-emerald-600 font-semibold tabular-nums">{formatCurrency(v)}</span> },
    { key: 'outstanding_after', label: 'Balance', render: v => (
      <span className={`tabular-nums font-medium ${parseFloat(v) > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{formatCurrency(v)}</span>
    )},
    { key: 'payment_mode', label: 'Mode', render: v => <Badge color="gray">{paymentModeLabel(v)}</Badge> },
  ];

  const execCols = [
    { key: 'full_name', label: 'Executive', render: (v, r) => (
      <div className="flex items-center gap-2.5">
        <Avatar name={v} size="sm" />
        <div>
          <p className="font-medium text-slate-800 text-sm">{v}</p>
          <p className="text-xs text-slate-400">{r.phone || 'â€”'}</p>
        </div>
      </div>
    )},
    { key: 'cash_collected', label: 'Cash collected', render: (v) => <span className="tabular-nums font-medium text-slate-700">{formatCurrency(v)}</span> },
    { key: 'cash_deposited', label: 'Cash deposited', render: (v) => <span className="tabular-nums font-medium text-emerald-700">{formatCurrency(v)}</span> },
    { key: 'cash_pending', label: 'Cash pending', render: (v) => (
      <span className={`tabular-nums font-semibold ${parseFloat(v) > 0 ? 'text-red-600' : 'text-slate-600'}`}>{formatCurrency(v)}</span>
    )},
    { key: 'non_cash_collected', label: 'Non-cash', render: (v) => <span className="tabular-nums text-slate-600">{formatCurrency(v)}</span> },
    { key: 'credit_added', label: 'Credit added', render: (v) => <span className="tabular-nums text-amber-700">{formatCurrency(v)}</span> },
    { key: 'actions', label: '', render: (_, r) => (
      canRecordDeposits ? (
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDepositExecId(r.id); setDepositModal(true); }}>
          Record deposit
        </Button>
      ) : null
    )},
  ];

  const depositCols = [
    { key: 'deposit_date', label: 'Date', render: (v) => formatDate(v) },
    { key: 'executive_name', label: 'Executive' },
    { key: 'amount', label: 'Amount', render: (v) => <span className="tabular-nums font-medium">{formatCurrency(v)}</span> },
    { key: 'payment_mode', label: 'Mode', render: (v) => <Badge color="gray">{paymentModeLabel(v) || 'â€”'}</Badge> },
    { key: 'notes', label: 'Notes', render: (v) => <span className="text-xs text-slate-400">{v || 'â€”'}</span> },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800">Market Collection</h1>
          <p className="text-sm text-slate-500">Retailer credit & real-time agent collections · <span className="text-emerald-500 font-medium">● Live sync</span></p>
        </div>
        <div className="flex gap-2">
          <Button variant="default" size="sm" onClick={() => loadAll()}>Sync</Button>
          <Button variant="default" size="sm" onClick={() => { setEditRetailer(null); setRetailerModal(true); }}>+ Retailer</Button>
          {canPostOutstanding && <Button variant="primary" size="sm" onClick={() => setOutstandingModal(true)}>+ Add outstanding</Button>}
          <Button variant="success" size="sm" onClick={() => setCollectionModal(true)}>+ Record collection</Button>
        </div>
      </div>

      {/* Stats */}
      {summary && !loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total collected" value={formatCurrency(summary.total_collected)} color="green" icon="💰" />
          <StatCard label="Credit outstanding" value={formatCurrency(outstanding.reduce((a, r) => a + parseFloat(r.current_outstanding), 0))} color="red" icon="📋" />
          <StatCard label="Active retailers" value={retailers.length} icon="🏪" />
          <StatCard label="Active agents" value={agents.length} color="violet" icon="🚴" />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-100">
        {(['overview', 'retailers', 'transactions'].concat(canViewExecutives ? ['executives'] : [])).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 mr-1 ${tab === t ? 'border-violet-600 text-violet-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t === 'overview' ? '📊 Overview' : t === 'retailers' ? '🏪 Retailers' : t === 'transactions' ? '📄 Transactions' : '👥 Executives'}
          </button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : loadError ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-slate-500 text-sm">Failed to load data. Check your connection.</p>
          <Button size="sm" variant="default" onClick={loadAll}>Retry</Button>
        </div>
      ) : (
        <>
          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Agents */}
              <Card>
                <div className="px-5 pt-4 pb-3 border-b border-slate-100">
                  <p className="font-semibold text-slate-800 text-sm">Today's Agents</p>
                </div>
                {agents.length === 0 ? (
                  <EmptyState icon="🚴" title="No agents yet" description="Add team members with collection access" />
                ) : (
                  <div className="divide-y divide-slate-50">
                    {agents.map(a => (
                      <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                        <Avatar name={a.full_name} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700">{a.full_name}</p>
                          <p className="text-xs text-slate-400">{a.phone || '—'} · {a.collections_count} collections</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-emerald-600">{formatCurrency(a.total_collected)}</p>
                          {a.total_credit > 0 && <p className="text-xs text-amber-500">+{formatCurrency(a.total_credit)} credit</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Top outstanding */}
              <Card>
                <div className="px-5 pt-4 pb-3 border-b border-slate-100">
                  <p className="font-semibold text-slate-800 text-sm">Top Outstanding Retailers</p>
                </div>
                {outstanding.length === 0 ? (
                  <EmptyState icon="✅" title="All clear!" description="No outstanding balances" />
                ) : (
                  <div className="divide-y divide-slate-50">
                    {outstanding.slice(0, 6).map(r => (
                      <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{r.name}</p>
                          <p className="text-xs text-slate-400">{r.area || '—'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-red-500">{formatCurrency(r.current_outstanding)}</p>
                          <div className="w-20 h-1 bg-slate-100 rounded-full overflow-hidden mt-1">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(r.utilization_pct, 100)}%`, background: r.utilization_pct > 80 ? '#ef4444' : '#f59e0b' }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* RETAILERS */}
          {tab === 'retailers' && (
            <Card>
              <div className="p-4 border-b border-slate-100">
                <Input placeholder="Search by name or area…" value={searchRetailer}
                  onChange={e => setSearchRetailer(e.target.value)} prefix="🔍" />
              </div>
              <div className="p-5">
                {filteredRetailers.length === 0
                  ? <EmptyState icon="🏪" title="No retailers yet" description="Add your first retailer to start tracking credit."
                      action={<Button variant="primary" onClick={() => setRetailerModal(true)}>Add retailer</Button>} />
                  : <Table columns={outstandingCols} rows={filteredRetailers} />
                }
              </div>
            </Card>
          )}

          {/* TRANSACTIONS */}
          {tab === 'transactions' && (
            <Card>
              <div className="p-5">
                {transactions.length === 0
                  ? <EmptyState icon="📄" title="No transactions yet"
                      action={<Button variant="success" onClick={() => setCollectionModal(true)}>Record first collection</Button>} />
                  : <Table columns={txnCols} rows={transactions} />
                }
              </div>
            </Card>
          )}

          {tab === 'executives' && canViewExecutives && (
            <div className="space-y-4">
              <Card>
                <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">Executive Cash Summary</p>
                    <p className="text-xs text-slate-400">Cash collected vs deposited (pending = to be submitted to office)</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="default" size="sm" onClick={() => loadExecutives()} disabled={execLoading}>Sync</Button>
                    {canRecordDeposits && (
                      <Button variant="primary" size="sm" onClick={() => { setDepositExecId(''); setDepositModal(true); }}>
                        + Record deposit
                      </Button>
                    )}
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex gap-2 mb-4">
                    <Input type="date" value={execFrom} onChange={(e) => setExecFrom(e.target.value)} wrapperClass="flex-1" label="From" />
                    <Input type="date" value={execTo} onChange={(e) => setExecTo(e.target.value)} wrapperClass="flex-1" label="To" />
                    <Button variant="default" onClick={() => loadExecutives()} disabled={execLoading}>Filter</Button>
                  </div>

                  {execLoading ? (
                    <div className="flex justify-center py-12"><Spinner size="lg" /></div>
                  ) : execLoadError ? (
                    <div className="flex flex-col items-center py-12 gap-3">
                      <p className="text-slate-500 text-sm">Failed to load executive summary.</p>
                      <Button size="sm" variant="default" onClick={() => loadExecutives()}>Retry</Button>
                    </div>
                  ) : (
                    <Table columns={execCols} rows={execSummary} empty="No executives found" />
                  )}
                </div>
              </Card>

              <Card>
                <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
                  <p className="font-semibold text-slate-800 text-sm">Deposits (range)</p>
                  <span className="text-xs text-slate-400">{execFrom} → {execTo}</span>
                </div>
                <div className="p-5">
                  <Table columns={depositCols} rows={execDeposits} empty="No deposits in this range" />
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      <RetailerModal open={retailerModal} onClose={() => { setRetailerModal(false); setEditRetailer(null); }} onSave={handleSaveRetailer} initial={editRetailer} />
      <CollectionModal open={collectionModal} onClose={() => setCollectionModal(false)} onSave={handleAddCollection} retailers={retailers} agents={agents} />
      <OutstandingModal open={outstandingModal} onClose={() => setOutstandingModal(false)} onSave={handleAddOutstanding} retailers={retailers} />
      <RetailerLedgerModal open={!!ledgerRetailer} onClose={() => setLedgerRetailer(null)} firmId={currentFirm?.id} retailer={ledgerRetailer} />
      <ExecutiveDepositModal
        open={depositModal}
        onClose={() => setDepositModal(false)}
        onSave={(d) => collectionAPI.addExecutiveDeposit(currentFirm.id, d).then(() => loadExecutives({ silent: true }))}
        executives={execSummary}
        initialExecutiveId={depositExecId}
      />
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </div>
  );
}
