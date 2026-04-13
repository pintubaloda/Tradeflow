import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { collectionAPI } from '../services/api';
import {
  Button, Input, Select, Modal, Badge, Table, StatCard, Card,
  EmptyState, useToast, Toast, Spinner, Avatar
} from '../components/common';
import { formatCurrency, formatDate, today, paymentModeLabel, debounce } from '../utils/helpers';
import { useWebSocket } from '../hooks/useWebSocket';

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
    if (!form.collectedAmount || parseFloat(form.collectedAmount) < 0) errs.collectedAmount = 'Enter amount';
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
          <Input label="Credit given (₹)" type="number" min="0" step="0.01" placeholder="0.00" prefix="₹" {...f('creditAmount')} />
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

export default function MarketCollection() {
  const { user, currentFirm, hasModule } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('overview'); // overview | retailers | transactions
  const [retailers, setRetailers] = useState([]);
  const [outstanding, setOutstanding] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [agents, setAgents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retailerModal, setRetailerModal] = useState(false);
  const [editRetailer, setEditRetailer] = useState(null);
  const [collectionModal, setCollectionModal] = useState(false);
  const [searchRetailer, setSearchRetailer] = useState('');
  const [loadError, setLoadError] = useState(false);

  const loadAll = useCallback(async () => {
    if (!currentFirm) return;
    setLoading(true);
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
    } finally { setLoading(false); }
  }, [currentFirm]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useWebSocket({
    tenantId: user?.tenantId,
    firmId: currentFirm?.id,
    enabled: !!currentFirm && hasModule('market_collection'),
    onMessage: (msg) => {
      if (msg.event === 'collection_added') loadAll();
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
      creditAmount: parseFloat(form.creditAmount) || 0,
      collectedAmount: parseFloat(form.collectedAmount) || 0,
      paymentMode: form.paymentMode, referenceNo: form.referenceNo, notes: form.notes,
    });
    toast.success('Collection recorded');
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

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800">Market Collection</h1>
          <p className="text-sm text-slate-500">Retailer credit & real-time agent collections · <span className="text-emerald-500 font-medium">● Live sync</span></p>
        </div>
        <div className="flex gap-2">
          <Button variant="default" size="sm" onClick={() => { setEditRetailer(null); setRetailerModal(true); }}>+ Retailer</Button>
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
        {['overview', 'retailers', 'transactions'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 mr-1 ${tab === t ? 'border-violet-600 text-violet-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t === 'overview' ? '📊 Overview' : t === 'retailers' ? '🏪 Retailers' : '📄 Transactions'}
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
        </>
      )}

      <RetailerModal open={retailerModal} onClose={() => { setRetailerModal(false); setEditRetailer(null); }} onSave={handleSaveRetailer} initial={editRetailer} />
      <CollectionModal open={collectionModal} onClose={() => setCollectionModal(false)} onSave={handleAddCollection} retailers={retailers} agents={agents} />
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </div>
  );
}
