import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { vendorAPI } from '../services/api';
import {
  Button, Input, Select, Textarea, Modal, Badge, Table,
  StatCard, Card, EmptyState, useToast, Toast, Spinner, ConfirmDialog
} from '../components/common';
import { formatCurrency, formatDate, today, txnTypeColor, txnTypeLabel, debounce } from '../utils/helpers';

const TXN_TYPES = [
  { value: 'advance', label: 'Advance (1st payment — DR)' },
  { value: 'debit',   label: 'Debit payment (2nd+ — DR)' },
  { value: 'credit',  label: 'Received payment (CR)' },
  { value: 'mnp',     label: 'MNP adjustment' },
];

function VendorFormModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState({ name: '', phone: '', address: '', gstNumber: '', openingBalance: '0', balanceType: 'DR', notes: '' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const toast = useToast();

  useEffect(() => {
    if (initial) setForm({ name: initial.name || '', phone: initial.phone || '', address: initial.address || '', gstNumber: initial.gst_number || '', openingBalance: initial.opening_balance || '0', balanceType: initial.balance_type || 'DR', notes: initial.notes || '' });
    else setForm({ name: '', phone: '', address: '', gstNumber: '', openingBalance: '0', balanceType: 'DR', notes: '' });
    setErrors({});
  }, [initial, open]);

  const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })), error: errors[k] });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErrors({ name: 'Name required' }); return; }
    setLoading(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Vendor' : 'Add Vendor'} size="md"
      footer={<>
        <Button variant="default" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={loading} onClick={submit}>{initial ? 'Save changes' : 'Add vendor'}</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Vendor / Partner name *" placeholder="M/s Patel Traders" {...f('name')} autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" placeholder="+91 98765…" {...f('phone')} type="tel" />
          <Input label="GST number" placeholder="22AAAAA0000A1Z5" {...f('gstNumber')} />
        </div>
        <Textarea label="Address" placeholder="Full address…" {...f('address')} rows={2} />
        {!initial && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Opening balance (₹)" type="number" min="0" step="0.01" {...f('openingBalance')} />
            <Select label="Balance type" {...f('balanceType')}>
              <option value="DR">Debit (DR)</option>
              <option value="CR">Credit (CR)</option>
            </Select>
          </div>
        )}
        <Textarea label="Notes" placeholder="Optional…" {...f('notes')} rows={2} />
      </form>
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </Modal>
  );
}

function TxnFormModal({ open, onClose, onSave, vendor }) {
  const [form, setForm] = useState({ txnDate: today(), txnType: 'advance', amount: '', mnpAmount: '0', referenceNo: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const toast = useToast();

  useEffect(() => {
    setForm({ txnDate: today(), txnType: 'advance', amount: '', mnpAmount: '0', referenceNo: '', notes: '' });
    setErrors({});
  }, [open]);

  const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })), error: errors[k] });

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.txnDate) errs.txnDate = 'Date required';
    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = 'Amount must be > 0';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add transaction');
    } finally { setLoading(false); }
  };

  const isDR = form.txnType === 'advance' || form.txnType === 'debit';
  const isCR = form.txnType === 'credit';

  return (
    <Modal open={open} onClose={onClose} title={`Add Transaction — ${vendor?.name || ''}`} size="md"
      footer={<>
        <Button variant="default" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={loading} onClick={submit}>Add entry</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date *" type="date" {...f('txnDate')} />
          <Select label="Transaction type *" {...f('txnType')}>
            {TXN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label={isDR ? 'Amount (DR) *' : isCR ? 'Amount (CR) *' : 'Amount *'} type="number" min="0.01" step="0.01" placeholder="0.00" prefix="₹" {...f('amount')} />
          <Input label="MNP amount" type="number" min="0" step="0.01" placeholder="0.00" prefix="₹" {...f('mnpAmount')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Reference no." placeholder="INV-001" {...f('referenceNo')} />
          <Input label="Notes" placeholder="Optional" {...f('notes')} />
        </div>
        {/* Preview balance */}
        <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 space-y-1">
          <p className="font-medium text-slate-700">Closing balance formula:</p>
          <p>Opening Balance {isDR ? '+' : '−'} {parseFloat(form.amount)||0} {parseFloat(form.mnpAmount)>0 ? `+ ${form.mnpAmount} (MNP)` : ''}</p>
        </div>
      </form>
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </Modal>
  );
}

function TxnEditModal({ open, onClose, onSave, vendor, initial }) {
  const [form, setForm] = useState({ txnDate: today(), txnType: 'advance', amount: '', mnpAmount: '0', referenceNo: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!initial) return;
    setForm({
      txnDate: (initial.txn_date || '').slice(0, 10),
      txnType: initial.txn_type,
      amount: String(initial.amount ?? ''),
      mnpAmount: String(initial.mnp_amount ?? 0),
      referenceNo: initial.reference_no || '',
      notes: initial.notes || '',
    });
    setErrors({});
    setConfirmOpen(false);
    setLoading(false);
  }, [open, initial]);

  const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })), error: errors[k] });

  const validate = () => {
    const errs = {};
    if (!form.txnDate) errs.txnDate = 'Date required';
    if (form.amount === '' || parseFloat(form.amount) < 0) errs.amount = 'Amount must be >= 0';
    if (parseFloat(form.mnpAmount || 0) < 0) errs.mnpAmount = 'MNP must be >= 0';
    return errs;
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setConfirmOpen(true);
  };

  const confirm = async () => {
    setLoading(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update transaction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={`Edit Transaction — ${vendor?.name || ''}`} size="md"
        footer={<>
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={loading} onClick={submit}>Save changes</Button>
        </>}>
        <form onSubmit={submit} className="space-y-3">
          <Input label="Date *" type="date" {...f('txnDate')} />
          <Select label="Transaction type" {...f('txnType')}>
            {TXN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Amount (₹)" type="number" min="0" step="0.01" placeholder="0.00" prefix="₹" {...f('amount')} />
            <Input label="MNP (₹)" type="number" min="0" step="0.01" placeholder="0.00" prefix="₹" {...f('mnpAmount')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Reference no." placeholder="INV-001" {...f('referenceNo')} />
            <Input label="Notes" placeholder="Optional" {...f('notes')} />
          </div>
        </form>
        <Toast toasts={toast.toasts} remove={toast.remove} />
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirm}
        title="Confirm update"
        message="Update this transaction? This will change the latest ledger balance."
        confirmLabel="Update"
      />
    </>
  );
}

function LedgerModal({ open, onClose, vendor, firmId }) {
  const { isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [txnModal, setTxnModal] = useState(false);
  const [editTxn, setEditTxn] = useState(null);
  const [deleteTxn, setDeleteTxn] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const toast = useToast();

  const load = useCallback(async () => {
    if (!open || !vendor) return;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await vendorAPI.getLedger(firmId, vendor.id, { from: from || undefined, to: to || undefined });
      setData(res.data);
    } catch (err) {
      setLoadError(true);
      toast.error(err.response?.data?.error || 'Failed to load ledger');
    } finally { setLoading(false); }
  }, [open, vendor, firmId, from, to]);

  useEffect(() => { load(); }, [load]);

  const handleAddTxn = async (form) => {
    await vendorAPI.addTxn(firmId, vendor.id, {
      txnDate: form.txnDate, txnType: form.txnType,
      amount: parseFloat(form.amount), mnpAmount: parseFloat(form.mnpAmount) || 0,
      referenceNo: form.referenceNo, notes: form.notes,
    });
    toast.success('Transaction added');
    load();
  };

  const latestTxnId = (data?.transactions || []).length
    ? data.transactions[data.transactions.length - 1].id
    : null;

  const handleUpdateTxn = async (form) => {
    if (!editTxn) return;
    await vendorAPI.updateTxn(firmId, vendor.id, editTxn.id, {
      txnDate: form.txnDate,
      txnType: form.txnType,
      amount: parseFloat(form.amount) || 0,
      mnpAmount: parseFloat(form.mnpAmount) || 0,
      referenceNo: form.referenceNo,
      notes: form.notes,
    });
    toast.success('Transaction updated');
    setEditTxn(null);
    load();
  };

  const handleDeleteTxn = async () => {
    if (!deleteTxn) return;
    try {
      await vendorAPI.deleteTxn(firmId, vendor.id, deleteTxn.id);
      toast.success('Transaction deleted');
      setDeleteTxn(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete transaction');
    }
  };

  const ledgerCols = [
    { key: 'txn_date', label: 'Date', render: v => formatDate(v) },
    { key: 'txn_type', label: 'Type', render: v => <Badge color={txnTypeColor(v)}>{txnTypeLabel(v)}</Badge> },
    { key: 'opening_balance', label: 'Opening', render: v => <span className="tabular-nums">{formatCurrency(v)}</span> },
    { key: 'amount', label: 'DR', render: (v, r) => r.txn_type === 'advance' || r.txn_type === 'debit' ? <span className="text-red-600 font-medium tabular-nums">{formatCurrency(v)}</span> : '—' },
    { key: 'amount_cr', label: 'CR', render: (_, r) => r.txn_type === 'credit' ? <span className="text-emerald-600 font-medium tabular-nums">{formatCurrency(r.amount)}</span> : '—' },
    { key: 'mnp_amount', label: 'MNP', render: v => v > 0 ? <span className="text-amber-600 tabular-nums">{formatCurrency(v)}</span> : '—' },
    { key: 'closing_balance', label: 'Closing', render: v => <span className={`font-semibold tabular-nums ${v > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(v)}</span> },
    { key: 'notes', label: 'Notes', render: v => <span className="text-slate-400 text-xs">{v || '—'}</span> },
    ...(isAdmin ? [{
      key: 'actions',
      label: '',
      className: 'text-right',
      cellClass: 'text-right',
      render: (_, r) => {
        const isLatest = r.id === latestTxnId;
        return (
          <div className="flex gap-1 justify-end">
            <Button size="sm" variant="ghost" disabled={!isLatest} onClick={(e) => { e.stopPropagation(); setEditTxn(r); }}>Edit</Button>
            <Button size="sm" variant="ghost" disabled={!isLatest} onClick={(e) => { e.stopPropagation(); setDeleteTxn(r); }}>Delete</Button>
          </div>
        );
      },
    }] : []),
  ];

  return (
    <>
      <Modal open={open} onClose={onClose} title={`Ledger — ${vendor?.name || ''}`} size="xl"
        footer={<Button variant="primary" onClick={() => setTxnModal(true)}>+ Add transaction</Button>}>
        {/* Summary */}
        {data?.summary && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Total DR</p>
              <p className="font-bold text-red-600 tabular-nums">{formatCurrency(data.summary.total_dr)}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Total CR</p>
              <p className="font-bold text-emerald-600 tabular-nums">{formatCurrency(data.summary.total_cr)}</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">MNP</p>
              <p className="font-bold text-amber-600 tabular-nums">{formatCurrency(data.summary.total_mnp)}</p>
            </div>
          </div>
        )}
        {/* Date filter */}
        <div className="flex gap-2 mb-4">
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} wrapperClass="flex-1" label="From" />
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} wrapperClass="flex-1" label="To" />
        </div>
        {loading ? <div className="flex justify-center py-8"><Spinner /></div> : loadError ? (
          <div className="flex flex-col items-center py-8 gap-3">
            <p className="text-sm text-slate-500">Failed to load transactions.</p>
            <Button size="sm" variant="default" onClick={load}>Retry</Button>
          </div>
        ) : (
          <Table columns={ledgerCols} rows={data?.transactions || []} empty="No transactions yet" />
        )}
        <Toast toasts={toast.toasts} remove={toast.remove} />
      </Modal>
      <TxnFormModal open={txnModal} onClose={() => setTxnModal(false)} onSave={handleAddTxn} vendor={vendor} />
      <TxnEditModal open={!!editTxn} onClose={() => setEditTxn(null)} onSave={handleUpdateTxn} vendor={vendor} initial={editTxn} />
      <ConfirmDialog
        open={!!deleteTxn}
        onClose={() => setDeleteTxn(null)}
        onConfirm={handleDeleteTxn}
        title="Confirm delete"
        message="Delete the most recent transaction? This cannot be undone."
        confirmLabel="Delete"
        danger
      />
    </>
  );
}

export default function VendorLedger() {
  const { currentFirm, hasModule } = useAuth();
  const toast = useToast();
  const [vendors, setVendors] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [vendorModal, setVendorModal] = useState(false);
  const [editVendor, setEditVendor] = useState(null);
  const [ledgerVendor, setLedgerVendor] = useState(null);

  const load = useCallback(async (q = '') => {
    if (!currentFirm) return;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await vendorAPI.list(currentFirm.id, { search: q || undefined });
      setVendors(res.data.vendors || []);
      setTotal(res.data.total || 0);
    } catch (_) {
      setLoadError(true);
    } finally { setLoading(false); }
  }, [currentFirm]);

  useEffect(() => { load(); }, [load]);

  const loadRef = React.useRef(load);
  React.useEffect(() => { loadRef.current = load; }, [load]);

  // Use ref so debounce is created once and always calls latest load
  const debouncedSearch = React.useRef(
    debounce((v) => loadRef.current(v), 400)
  ).current;

  const handleSearch = (e) => { setSearch(e.target.value); debouncedSearch(e.target.value); };

  const handleSaveVendor = async (form) => {
    if (editVendor) {
      await vendorAPI.update(currentFirm.id, editVendor.id, form);
      toast.success('Vendor updated');
    } else {
      await vendorAPI.create(currentFirm.id, form);
      toast.success('Vendor added');
    }
    load();
  };

  if (!hasModule('vendor_ledger')) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center"><p className="text-slate-500 mb-3">Vendor Ledger module not active</p>
        <Button variant="primary" onClick={() => window.location.href = '/subscriptions'}>Enable module</Button></div>
    </div>
  );

  const cols = [
    { key: 'name', label: 'Vendor / Partner', render: (v, r) => (
      <div><p className="font-medium text-slate-800">{v}</p><p className="text-xs text-slate-400">{r.phone || '—'}</p></div>
    )},
    { key: 'gst_number', label: 'GST No.', render: v => v || '—' },
    { key: 'current_balance', label: 'Balance', render: (v, r) => (
      <span className={`font-semibold tabular-nums ${parseFloat(v) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
        {formatCurrency(v || r.opening_balance)}
      </span>
    )},
    { key: 'balance_type', label: 'Type', render: (_, r) => {
      const bal = parseFloat(r.current_balance || r.opening_balance);
      return <Badge color={bal > 0 ? 'red' : 'green'}>{bal > 0 ? 'DR' : 'CR'}</Badge>;
    }},
    { key: 'actions', label: '', render: (_, r) => (
      <div className="flex gap-1 justify-end">
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setLedgerVendor(r); }}>Ledger</Button>
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditVendor(r); setVendorModal(true); }}>Edit</Button>
      </div>
    ), cellClass: 'text-right' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800">Vendor Ledger</h1>
          <p className="text-sm text-slate-500">Manage vendor POS transactions · {total} vendor{total !== 1 ? 's' : ''}</p>
        </div>
        <Button variant="primary" onClick={() => { setEditVendor(null); setVendorModal(true); }}>+ Add vendor</Button>
      </div>

      <Card>
        <div className="p-4 border-b border-slate-100">
          <Input placeholder="Search vendors by name or phone…" value={search} onChange={handleSearch} prefix="🔍" />
        </div>
        <div className="p-5">
          {loading ? <div className="flex justify-center py-8"><Spinner /></div> :
           loadError ? (
            <div className="flex flex-col items-center py-8 gap-3">
              <p className="text-sm text-slate-500">Failed to load vendors.</p>
              <Button size="sm" variant="default" onClick={() => load()}>Retry</Button>
            </div>
          ) : (
            vendors.length === 0
              ? <EmptyState icon="🏭" title="No vendors yet" description="Add your first vendor to start tracking POS transactions."
                  action={<Button variant="primary" onClick={() => { setEditVendor(null); setVendorModal(true); }}>Add vendor</Button>} />
              : <Table columns={cols} rows={vendors} onRowClick={(r) => setLedgerVendor(r)} />
          )}
        </div>
      </Card>

      <VendorFormModal open={vendorModal} onClose={() => { setVendorModal(false); setEditVendor(null); }} onSave={handleSaveVendor} initial={editVendor} />
      <LedgerModal open={!!ledgerVendor} onClose={() => setLedgerVendor(null)} vendor={ledgerVendor} firmId={currentFirm?.id} />
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </div>
  );
}
