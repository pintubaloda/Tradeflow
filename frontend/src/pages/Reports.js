import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { reportAPI } from '../services/api';
import { Button, Card, Input, Spinner, StatCard, Table } from '../components/common';
import { formatCurrency, formatDate, today, txnTypeLabel } from '../utils/helpers';

const isoMinusDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

export default function Reports() {
  const { currentFirm, hasModule, isAdmin } = useAuth();
  const navigate = useNavigate();

  const reportsEnabled = hasModule('reports');
  const vendorEnabled = hasModule('vendor_ledger');
  const collectionEnabled = hasModule('market_collection');

  const [from, setFrom] = useState(() => isoMinusDays(30));
  const [to, setTo] = useState(() => today());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [summary, setSummary] = useState(null);
  const [vendorTxns, setVendorTxns] = useState([]);
  const [collTxns, setCollTxns] = useState([]);

  const params = useMemo(() => ({ from, to }), [from, to]);

  const load = useCallback(async () => {
    if (!currentFirm || !reportsEnabled) return;
    setLoading(true);
    setLoadError(false);
    try {
      const proms = [
        reportAPI.summary(currentFirm.id, params),
        vendorEnabled ? reportAPI.vendorTransactions(currentFirm.id, { ...params, limit: 20, page: 1 }) : Promise.resolve(null),
        collectionEnabled ? reportAPI.collections(currentFirm.id, { ...params, limit: 20, page: 1 }) : Promise.resolve(null),
      ];
      const [sRes, vRes, cRes] = await Promise.all(proms);
      setSummary(sRes.data);
      setVendorTxns(vRes?.data?.transactions || []);
      setCollTxns(cRes?.data?.transactions || []);
    } catch (_) {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [currentFirm, reportsEnabled, vendorEnabled, collectionEnabled, params]);

  useEffect(() => { load(); }, [load]);

  if (!currentFirm) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <p className="text-slate-600 font-medium">No firm selected</p>
        <Button variant="primary" onClick={() => navigate('/firms')}>Select a firm</Button>
      </div>
    );
  }

  if (!reportsEnabled) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Reports</h1>
          <p className="text-sm text-slate-500">Analytics for vendors and collections</p>
        </div>
        <Card className="p-6">
          <p className="text-sm font-semibold text-slate-800 mb-1">Reports module not active</p>
          <p className="text-sm text-slate-500">Ask your admin to enable the “Reports & Analytics” module.</p>
          {isAdmin && (
            <div className="mt-4">
              <Button variant="primary" onClick={() => navigate('/subscriptions')}>Open Subscriptions</Button>
            </div>
          )}
        </Card>
      </div>
    );
  }

  const vendor = summary?.vendor?.enabled ? summary.vendor : null;
  const coll = summary?.collection?.enabled ? summary.collection : null;

  const topVendorsCols = [
    { key: 'name', label: 'Vendor' },
    { key: 'balance', label: 'Balance', render: (v) => formatCurrency(v), className: 'text-right', cellClass: 'text-right font-semibold' },
  ];
  const topRetailersCols = [
    { key: 'name', label: 'Retailer' },
    { key: 'area', label: 'Area' },
    { key: 'current_outstanding', label: 'Outstanding', render: (v) => formatCurrency(v), className: 'text-right', cellClass: 'text-right font-semibold' },
  ];
  const agentsCols = [
    { key: 'full_name', label: 'Agent' },
    { key: 'collections_count', label: 'Collections', className: 'text-right', cellClass: 'text-right' },
    { key: 'total_collected', label: 'Collected', render: (v) => formatCurrency(v), className: 'text-right', cellClass: 'text-right font-semibold' },
  ];
  const vendorTxnCols = [
    { key: 'txn_date', label: 'Date', render: (v) => formatDate(v) },
    { key: 'vendor_name', label: 'Vendor' },
    { key: 'txn_type', label: 'Type', render: (v) => txnTypeLabel(v) },
    { key: 'amount', label: 'Amount', render: (v) => formatCurrency(v), className: 'text-right', cellClass: 'text-right font-semibold' },
    { key: 'created_by_name', label: 'By', render: (v) => v || '—' },
  ];
  const collTxnCols = [
    { key: 'txn_date', label: 'Date', render: (v) => formatDate(v) },
    { key: 'retailer_name', label: 'Retailer' },
    { key: 'collector_name', label: 'Collector' },
    { key: 'collected_amount', label: 'Collected', render: (v) => formatCurrency(v), className: 'text-right', cellClass: 'text-right font-semibold' },
    { key: 'credit_amount', label: 'Credit', render: (v) => formatCurrency(v), className: 'text-right', cellClass: 'text-right' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Reports</h1>
          <p className="text-sm text-slate-500">Firm: <span className="font-medium text-violet-600">{currentFirm.name}</span></p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <Input label="From" type="date" value={from} onChange={e => setFrom(e.target.value)} wrapperClass="w-[170px]" />
          <Input label="To" type="date" value={to} onChange={e => setTo(e.target.value)} wrapperClass="w-[170px]" />
          <Button variant="primary" onClick={load} disabled={loading}>Refresh</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : loadError ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-slate-500 text-sm">Failed to load reports.</p>
          <Button size="sm" variant="default" onClick={load}>Retry</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {vendor ? (
              <>
                <StatCard label="Active Vendors" value={vendor.active_vendors || 0} icon="🏭" />
                <StatCard label="Vendor Outstanding (DR)" value={formatCurrency(vendor.dr_outstanding)} color="red" icon="📌" />
              </>
            ) : (
              <div className="col-span-2">
                <Card className="p-5">
                  <p className="text-sm font-semibold text-slate-700 mb-1">Vendor reports disabled</p>
                  <p className="text-xs text-slate-400">Enable “Vendor Ledger” module to see vendor analytics.</p>
                </Card>
              </div>
            )}

            {coll ? (
              <>
                <StatCard label="Active Retailers" value={coll.active_retailers || 0} icon="🛒" />
                <StatCard label="Collected (Range)" value={formatCurrency(coll.period?.total_collected || 0)} color="green" icon="💰" />
              </>
            ) : (
              <div className="col-span-2">
                <Card className="p-5">
                  <p className="text-sm font-semibold text-slate-700 mb-1">Collection reports disabled</p>
                  <p className="text-xs text-slate-400">Enable “Market Collection” module to see collection analytics.</p>
                </Card>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {vendor && (
              <Card>
                <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
                  <p className="font-semibold text-slate-800 text-sm">Top Vendors (by balance)</p>
                  <span className="text-xs text-slate-400">{summary?.range?.from} → {summary?.range?.to}</span>
                </div>
                <Table columns={topVendorsCols} rows={summary?.topVendors || []} empty="No vendors found" />
              </Card>
            )}

            {coll && (
              <Card>
                <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
                  <p className="font-semibold text-slate-800 text-sm">Top Retailers (outstanding)</p>
                  <span className="text-xs text-slate-400">Current</span>
                </div>
                <Table columns={topRetailersCols} rows={summary?.topRetailers || []} empty="No retailers found" />
              </Card>
            )}

            {coll && (
              <Card>
                <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
                  <p className="font-semibold text-slate-800 text-sm">Agents (range)</p>
                  <span className="text-xs text-emerald-500 font-medium">● Live</span>
                </div>
                <Table columns={agentsCols} rows={summary?.agents || []} empty="No agents found" />
              </Card>
            )}

            {vendor && (
              <Card>
                <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
                  <p className="font-semibold text-slate-800 text-sm">Recent Vendor Transactions</p>
                  <span className="text-xs text-slate-400">Latest 20</span>
                </div>
                <Table columns={vendorTxnCols} rows={vendorTxns} empty="No vendor transactions in this range" />
              </Card>
            )}

            {coll && (
              <Card>
                <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
                  <p className="font-semibold text-slate-800 text-sm">Recent Collections</p>
                  <span className="text-xs text-slate-400">Latest 20</span>
                </div>
                <Table columns={collTxnCols} rows={collTxns} empty="No collections in this range" />
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

