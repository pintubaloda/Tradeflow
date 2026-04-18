import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI, userAPI, subscriptionAPI } from '../services/api';
import {
  Button, Input, Select, Modal, Badge, Card, StatCard,
  useToast, Toast, Spinner, Avatar, EmptyState, Table
} from '../components/common';
import { formatDate } from '../utils/helpers';

function TwoFactorModal({ open, onClose, enabled, onEnabledChanged }) {
  const { loadMe } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('idle'); // idle | setup | backupCodes
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [otp, setOtp] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);

  useEffect(() => {
    if (!open) {
      setLoading(false);
      setStage('idle');
      setQr('');
      setSecret('');
      setOtp('');
      setBackupCode('');
      setBackupCodes([]);
    }
  }, [open]);

  const startSetup = async () => {
    setLoading(true);
    try {
      const { data } = await authAPI.twofaSetup();
      setQr(data.qrDataUrl || '');
      setSecret(data.secretBase32 || '');
      setStage('setup');
    } catch (err) {
      toast.error(err.response?.data?.error || '2FA setup failed');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const enable = async () => {
    if (!otp) { toast.error('Enter OTP'); return; }
    setLoading(true);
    try {
      const { data } = await authAPI.twofaEnable({ otp });
      setBackupCodes(data.backupCodes || []);
      setStage('backupCodes');
      await loadMe();
      onEnabledChanged?.(true);
      toast.success('2FA enabled');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to enable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const disable = async () => {
    if (!otp && !backupCode) { toast.error('Enter OTP or backup code'); return; }
    setLoading(true);
    try {
      await authAPI.twofaDisable({ otp: otp || undefined, backupCode: backupCode || undefined });
      await loadMe();
      onEnabledChanged?.(false);
      toast.success('2FA disabled');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const regenerate = async () => {
    if (!otp) { toast.error('Enter OTP'); return; }
    setLoading(true);
    try {
      const { data } = await authAPI.twofaRegenerateBackupCodes({ otp });
      setBackupCodes(data.backupCodes || []);
      setStage('backupCodes');
      toast.success('Backup codes regenerated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to regenerate codes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !enabled) startSetup();
  }, [open, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const footer = (
    <>
      <Button variant="default" onClick={onClose}>Close</Button>
      {enabled ? (
        <>
          <Button variant="default" loading={loading} onClick={regenerate}>Regenerate backup codes</Button>
          <Button variant="danger" loading={loading} onClick={disable}>Disable 2FA</Button>
        </>
      ) : stage === 'setup' ? (
        <Button variant="primary" loading={loading} onClick={enable}>Enable 2FA</Button>
      ) : null}
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={enabled ? 'Two-factor authentication' : 'Enable two-factor authentication'}
      size="md"
      footer={footer}
    >
      {enabled ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            2FA is enabled. To disable it, enter an authenticator code (recommended) or a backup code.
          </p>
          <Input label="Authenticator code" inputMode="numeric" placeholder="123456" value={otp} onChange={(e) => setOtp(e.target.value)} />
          <Input label="Backup code" placeholder="A1B2C3D4E5" value={backupCode} onChange={(e) => setBackupCode(e.target.value)} />
          {stage === 'backupCodes' && backupCodes.length > 0 && (
            <Card className="p-3 bg-amber-50 border border-amber-100">
              <p className="text-xs text-amber-700 font-medium mb-2">New backup codes (save these now):</p>
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((c) => (
                  <code key={c} className="text-xs bg-white border border-amber-100 rounded-lg px-2 py-1">{c}</code>
                ))}
              </div>
            </Card>
          )}
        </div>
      ) : stage === 'setup' ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Scan this QR in Google Authenticator / Microsoft Authenticator, then enter the 6-digit code to enable 2FA.
          </p>
          {qr && <img src={qr} alt="2FA QR" className="mx-auto w-44 h-44 rounded-xl border border-slate-100" />}
          {secret && (
            <div className="text-xs text-slate-500">
              Canâ€™t scan? Enter this secret manually: <code className="ml-1 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">{secret}</code>
            </div>
          )}
          <Input label="Authenticator code" inputMode="numeric" placeholder="123456" value={otp} onChange={(e) => setOtp(e.target.value)} />
          <p className="text-xs text-slate-400">
            After enabling, youâ€™ll get backup codes once. Store them safely.
          </p>
        </div>
      ) : (
        <div className="flex justify-center py-10"><Spinner size="lg" /></div>
      )}
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════
// TEAM PAGE
// ══════════════════════════════════════════════════════════════
function UserModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState({ email: '', fullName: '', phone: '', role: 'staff', password: '' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const toast = useToast();

  useEffect(() => {
    if (initial) setForm({ email: initial.email, fullName: initial.full_name, phone: initial.phone||'', role: initial.role, password: '' });
    else setForm({ email: '', fullName: '', phone: '', role: 'staff', password: '' });
    setErrors({});
  }, [initial, open]);

  const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })), error: errors[k] });

  const validate = () => {
    const e = {};
    if (!form.email) e.email = 'Email required';
    if (!initial && form.password.length < 8) e.password = 'Min 8 characters';
    if (!form.fullName.trim()) e.fullName = 'Name required';
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try { await onSave(form); onClose(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Team Member' : 'Add Team Member'} size="md"
      footer={<>
        <Button variant="default" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={loading} onClick={submit}>{initial ? 'Save' : 'Add member'}</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Full name *" placeholder="Anil Kumar" {...f('fullName')} autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Email *" type="email" placeholder="anil@yourco.com" {...f('email')} disabled={!!initial} />
          <Input label="Phone" placeholder="+91 98765…" {...f('phone')} type="tel" />
        </div>
        <Select label="Role" {...f('role')}>
          <option value="tenant_admin">Tenant Admin</option>
          <option value="firm_admin">Firm Admin</option>
          <option value="accountant">Accountant</option>
          <option value="collection_boy">Collection Boy</option>
          <option value="staff">Staff</option>
          <option value="viewer">Viewer</option>
        </Select>
        {!initial && (
          <Input label="Password *" type="password" placeholder="Min 8 characters" {...f('password')} />
        )}
        {initial && (
          <p className="text-xs text-slate-400">To change password, use the Change Password option.</p>
        )}
      </form>
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </Modal>
  );
}

export function TeamPage() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modal, setModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [twofaOpen, setTwofaOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try { const res = await userAPI.list(); setUsers(res.data || []); }
    catch (_) { setLoadError(true); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    if (editUser) {
      await userAPI.update(editUser.id, { fullName: form.fullName, phone: form.phone, role: form.role, isActive: true });
      toast.success('User updated');
    } else {
      await userAPI.create(form);
      toast.success('User added');
    }
    load();
  };

  const roleColor = (r) => ({ tenant_admin: 'violet', firm_admin: 'blue', accountant: 'blue', collection_boy: 'green', staff: 'gray', viewer: 'gray' }[r] || 'gray');

  const cols = [
    { key: 'full_name', label: 'Name', render: (v, r) => (
      <div className="flex items-center gap-2.5"><Avatar name={v} size="sm" /><div><p className="font-medium text-slate-800 text-sm">{v}</p><p className="text-xs text-slate-400">{r.email}</p></div></div>
    )},
    { key: 'phone', label: 'Phone', render: v => v || '—' },
    { key: 'role', label: 'Role', render: v => <Badge color={roleColor(v)}>{v?.replace(/_/g, ' ')}</Badge> },
    { key: 'firms', label: 'Firms', render: v => v?.length ? v.map(f => <Badge key={f.firmId} color="gray" className="mr-1">{f.firmName}</Badge>) : '—' },
    { key: 'is_active', label: 'Status', render: v => <Badge color={v ? 'green' : 'gray'}>{v ? 'Active' : 'Inactive'}</Badge> },
    { key: 'last_login_at', label: 'Last login', render: v => formatDate(v) },
    { key: 'actions', label: '', render: (_, r) => (
      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditUser(r); setModal(true); }}>Edit</Button>
    )},
  ];

  if (!isAdmin) return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-slate-500">Admin access required</p></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">Security</p>
            <p className="text-sm font-semibold text-slate-800">Two-factor authentication (2FA)</p>
            <p className="text-xs text-slate-500 mt-1">
              {user?.twofaEnabled ? 'Enabled for your account.' : 'Add an extra layer of protection to your login.'}
            </p>
          </div>
          <Badge color={user?.twofaEnabled ? 'green' : 'gray'}>{user?.twofaEnabled ? 'Enabled' : 'Disabled'}</Badge>
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            variant={user?.twofaEnabled ? 'default' : 'primary'}
            onClick={() => setTwofaOpen(true)}
          >
            {user?.twofaEnabled ? 'Manage 2FA' : 'Enable 2FA'}
          </Button>
        </div>
      </Card>

      <TwoFactorModal
        open={twofaOpen}
        onClose={() => setTwofaOpen(false)}
        enabled={!!user?.twofaEnabled}
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Team</h1>
          <p className="text-sm text-slate-500">{users.length} member{users.length !== 1 ? 's' : ''} · Collection boys can be in multiple firms</p>
        </div>
        <Button variant="primary" onClick={() => { setEditUser(null); setModal(true); }}>+ Add member</Button>
      </div>
      <Card>
        <div className="p-5">
          {loading ? <div className="flex justify-center py-8"><Spinner /></div>
            : loadError ? (
              <div className="flex flex-col items-center py-8 gap-3">
                <p className="text-sm text-slate-500">Failed to load team members.</p>
                <Button size="sm" variant="default" onClick={load}>Retry</Button>
              </div>
            ) : users.length === 0
            ? <EmptyState icon="👥" title="No team members yet" action={<Button variant="primary" onClick={() => setModal(true)}>Add member</Button>} />
            : <Table columns={cols} rows={users} />
          }
        </div>
      </Card>
      <UserModal open={modal} onClose={() => { setModal(false); setEditUser(null); }} onSave={handleSave} initial={editUser} />
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SUBSCRIPTIONS PAGE
// ══════════════════════════════════════════════════════════════
export function SubscriptionsPage() {
  const { isAdmin, loadMe } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activating, setActivating] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [subRes, planRes] = await Promise.all([subscriptionAPI.my(), subscriptionAPI.plans()]);
      setData(subRes.data);
      setPlans(planRes.data || []);
    } catch (_) { setLoadError(true); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activateModule = async (key) => {
    setActivating(key);
    try {
      await subscriptionAPI.subscribeModule(key);
      toast.success('Module activated');
      await load();
      await loadMe();
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'PAYMENT_REQUIRED') {
        toast.error(`Payment required: ${err.response.data.message}`);
      } else {
        toast.error(err.response?.data?.error || 'Failed to activate module');
      }
    } finally { setActivating(''); }
  };

  const upgradePlan = async (planId) => {
    try {
      await subscriptionAPI.upgradePlan(planId);
      toast.success('Plan updated');
      await load();
      await loadMe();
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'PAYMENT_REQUIRED') {
        toast.error(`Payment required: ${err.response.data.message}`);
      } else {
        toast.error(err.response?.data?.error || 'Failed to update plan');
      }
    }
  };

  const MODULES = [
    { key: 'vendor_ledger', name: 'Vendor Ledger', icon: '📒', price: 0, desc: 'POS transactions, advance/debit/credit tracking, full partner ledger.' },
    { key: 'market_collection', name: 'Market Collection', icon: '🤝', price: 499, desc: 'Retailer credit management, real-time collection agent tracking, live sync.' },
    { key: 'reports', name: 'Reports & Analytics', icon: '📊', price: 299, desc: 'Monthly P&L, vendor/retailer reports, export to PDF & Excel.' },
  ];

  const activeKeys = data?.modules?.filter(m => m.is_active).map(m => m.module_key) || [];

  if (!isAdmin) return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-slate-500">Admin access required</p></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Subscriptions</h1>
        <p className="text-sm text-slate-500">Manage your plan and modules</p>
      </div>

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> :
       loadError ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-slate-500 text-sm">Failed to load subscription data.</p>
          <Button size="sm" variant="default" onClick={load}>Retry</Button>
        </div>
      ) : (
        <>
          {/* Current plan */}
          {data?.tenant && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">Current plan</p>
                  <p className="text-xl font-bold text-slate-800">{data.tenant.plan_name || 'Starter'}</p>
                </div>
                <Badge color="violet">{data.firmCount}/{data.tenant.max_firms} firms used</Badge>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 mb-4">
                <div className="bg-violet-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min((data.firmCount / data.tenant.max_firms) * 100, 100)}%` }} />
              </div>
              <p className="text-xs text-slate-400">
                {data.firmCount >= data.tenant.max_firms
                  ? '⚠️ Firm limit reached — upgrade to add more firms'
                  : `${data.tenant.max_firms - data.firmCount} more firm${data.tenant.max_firms - data.firmCount !== 1 ? 's' : ''} available`}
              </p>
            </Card>
          )}

          {/* Modules */}
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">Modules</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {MODULES.map(mod => {
                const active = activeKeys.includes(mod.key);
                return (
                  <Card key={mod.key} className={`p-5 flex flex-col gap-3 ${active ? 'border-violet-200 bg-violet-50/30' : ''}`}>
                    <div className="flex items-start justify-between">
                      <span className="text-2xl">{mod.icon}</span>
                      <Badge color={active ? 'green' : 'gray'}>{active ? 'Active' : 'Inactive'}</Badge>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm mb-1">{mod.name}</p>
                      <p className="text-xs text-slate-500">{mod.desc}</p>
                    </div>
                    <div className="mt-auto pt-2 border-t border-slate-100 flex items-center justify-between">
                      <p className="text-sm font-bold text-violet-600">
                        {mod.price === 0 ? 'Free' : `₹${mod.price}/mo`}
                      </p>
                      {!active ? (
                        <Button size="sm" variant="primary"
                          loading={activating === mod.key}
                          onClick={() => activateModule(mod.key)}>
                          Enable
                        </Button>
                      ) : <span className="text-xs text-emerald-600 font-medium">✓ Enabled</span>}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Plans */}
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">Plans (Firm limits)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map(plan => {
                const isCurrent = data?.tenant?.plan_id === plan.id;
                return (
                  <Card key={plan.id} className={`p-5 flex flex-col gap-2 ${isCurrent ? 'border-violet-300 bg-violet-50/40' : ''}`}>
                    {isCurrent && <Badge color="violet">Current plan</Badge>}
                    <p className="font-bold text-slate-800">{plan.name}</p>
                    <div>
                      <p className="text-xl font-bold text-violet-600">
                        ₹{plan.base_price}<span className="text-sm font-normal text-slate-400">/mo base</span>
                      </p>
                      {plan.price_per_firm > 0 && (
                        <p className="text-xs text-slate-500">+ ₹{plan.price_per_firm}/firm/mo for extra firms</p>
                      )}
                    </div>
                    <ul className="text-xs text-slate-600 space-y-1">
                      <li>✓ Up to {plan.max_firms} firm{plan.max_firms !== 1 ? 's' : ''}</li>
                      {plan.features?.vendor_ledger && <li>✓ Vendor Ledger</li>}
                      {plan.features?.market_collection && <li>✓ Market Collection</li>}
                      {plan.features?.reports && <li>✓ Reports & Analytics</li>}
                    </ul>
                    {!isCurrent && (
                      <Button size="sm" variant="primary" onClick={() => upgradePlan(plan.id)} className="mt-2">
                        Switch to {plan.name}
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        </>
      )}
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </div>
  );
}
