import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { vendorAPI, collectionAPI } from '../services/api';
import { StatCard, Card, Avatar, Spinner, Button } from '../components/common';
import { formatCurrency, formatDate } from '../utils/helpers';
import { useWebSocket } from '../hooks/useWebSocket';

export default function Dashboard() {
  const { user, currentFirm, hasModule } = useAuth();
  const navigate = useNavigate();
  const [vendorStats, setVendorStats] = useState(null);
  const [collStats, setCollStats] = useState(null);
  const [recentVendorTxns, setRecentVendorTxns] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!currentFirm) return;
    setLoading(true);
    setLoadError(false);
    try {
      const proms = [];
      if (hasModule('vendor_ledger')) {
        proms.push(vendorAPI.list(currentFirm.id, { limit: 5 }));
      } else {
        proms.push(Promise.resolve(null));
      }
      if (hasModule('market_collection')) {
        proms.push(collectionAPI.list(currentFirm.id, { limit: 5 }));
        proms.push(collectionAPI.agents(currentFirm.id));
      } else {
        proms.push(Promise.resolve(null));
        proms.push(Promise.resolve(null));
      }
      const [vRes, cRes, aRes] = await Promise.all(proms);
      if (vRes) setVendorStats(vRes.data);
      if (cRes) { setCollStats(cRes.data.summary); setRecentVendorTxns(cRes.data.transactions || []); }
      if (aRes) setAgents(aRes.data || []);
    } catch (_) {
      setLoadError(true);
    } finally { setLoading(false); }
  }, [currentFirm, hasModule]);

  useEffect(() => { load(); }, [load]);

  useWebSocket({
    tenantId: user?.tenantId,
    firmId: currentFirm?.id,
    enabled: !!currentFirm,
    onMessage: (msg) => {
      if (msg.event === 'collection_added' || msg.event === 'vendor_txn_added' || msg.event === 'vendor_txn_updated' || msg.event === 'vendor_txn_deleted') load();
    },
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (!currentFirm) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="text-4xl">🏢</div>
      <p className="text-slate-600 font-medium">No firm selected</p>
      <Button variant="primary" onClick={() => navigate('/firms')}>Create or select a firm</Button>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{greeting}, {user?.fullName?.split(' ')[0]} 👋</h1>
          <p className="text-sm text-slate-500">Overview for <span className="font-medium text-violet-600">{currentFirm.name}</span> · {formatDate(new Date())}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {hasModule('vendor_ledger') && (
            <Button size="sm" variant="primary" onClick={() => navigate('/vendor-ledger')}>+ Add transaction</Button>
          )}
          {hasModule('market_collection') && (
            <Button size="sm" variant="default" onClick={() => navigate('/collection')}>Record collection</Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-slate-500 text-sm">Failed to load dashboard data.</p>
          <Button size="sm" variant="default" onClick={load}>Retry</Button>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {hasModule('vendor_ledger') && <>
              <StatCard label="Active Vendors" value={vendorStats?.total || 0} icon="🏭" />
              <StatCard label="Total Outstanding (DR)" value={formatCurrency(0)} color="red" icon="📤" sub="Vendor balances" />
            </>}
            {hasModule('market_collection') && <>
              <StatCard label="Collected Today" value={formatCurrency(collStats?.total_collected || 0)} color="green" icon="💰" />
              <StatCard label="Total Outstanding" value={formatCurrency(0)} color="amber" icon="📋" sub="Retailer balances" />
            </>}
            {!hasModule('vendor_ledger') && !hasModule('market_collection') && (
              <div className="col-span-4">
                <Card className="p-8 text-center">
                  <p className="text-slate-500 text-sm mb-3">No modules active yet.</p>
                  <Button variant="primary" onClick={() => navigate('/subscriptions')}>Browse modules ⚡</Button>
                </Card>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Recent collections */}
            {hasModule('market_collection') && (
              <Card>
                <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
                  <p className="font-semibold text-slate-800 text-sm">Recent Collections</p>
                  <button onClick={() => navigate('/collection')} className="text-xs text-violet-500 hover:underline">View all</button>
                </div>
                <div className="divide-y divide-slate-50">
                  {recentVendorTxns.length === 0 ? (
                    <p className="text-center text-sm text-slate-400 py-6">No collections yet today</p>
                  ) : recentVendorTxns.slice(0, 5).map(t => (
                    <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <Avatar name={t.collector_name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{t.retailer_name}</p>
                        <p className="text-xs text-slate-400">{t.collector_name} · {formatDate(t.txn_date)}</p>
                      </div>
                      <span className="text-sm font-semibold text-emerald-600">{formatCurrency(t.collected_amount)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Active agents */}
            {hasModule('market_collection') && agents.length > 0 && (
              <Card>
                <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
                  <p className="font-semibold text-slate-800 text-sm">Today's Agents</p>
                  <span className="text-xs text-emerald-500 font-medium">● Live</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {agents.map(a => (
                    <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                      <Avatar name={a.full_name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">{a.full_name}</p>
                        <p className="text-xs text-slate-400">{a.collections_count} collections</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-emerald-600">{formatCurrency(a.total_collected)}</p>
                        <p className="text-xs text-slate-400">collected</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Module upsell */}
            {!hasModule('market_collection') && (
              <Card className="p-6 flex flex-col items-start gap-3 border-dashed">
                <div className="text-2xl">🤝</div>
                <div>
                  <p className="font-semibold text-slate-700 text-sm">Market Collection module</p>
                  <p className="text-xs text-slate-400 mt-1">Track retailer credit, manage collection agents in real-time. ₹499/month.</p>
                </div>
                <Button size="sm" variant="primary" onClick={() => navigate('/subscriptions')}>Enable module</Button>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
