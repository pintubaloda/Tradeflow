import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { firmAPI, userAPI } from '../services/api';
import {
  Button, Input, Select, Modal, Badge, Card, StatCard,
  useToast, Toast, Spinner, Avatar, EmptyState, Table
} from '../components/common';
import { formatDate, getInitials } from '../utils/helpers';

function FirmModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState({ name: '', address: '', phone: '', gstNumber: '', panNumber: '', currency: 'INR' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const toast = useToast();

  useEffect(() => {
    if (initial) setForm({ name: initial.name, address: initial.address||'', phone: initial.phone||'', gstNumber: initial.gst_number||'', panNumber: initial.pan_number||'', currency: initial.currency||'INR' });
    else setForm({ name: '', address: '', phone: '', gstNumber: '', panNumber: '', currency: 'INR' });
    setErrors({});
  }, [initial, open]);

  const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })), error: errors[k] });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErrors({ name: 'Firm name required' }); return; }
    setLoading(true);
    try { await onSave(form); onClose(); }
    catch (err) {
      const code = err.response?.data?.code;
      if (code === 'FIRM_LIMIT_REACHED') toast.error(err.response.data.error);
      else toast.error(err.response?.data?.error || 'Failed');
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Firm' : 'Add New Firm'} size="md"
      footer={<>
        <Button variant="default" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={loading} onClick={submit}>{initial ? 'Save' : 'Create firm'}</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Firm / Business name *" placeholder="e.g. Sharma Distributors - Branch 2" {...f('name')} autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" placeholder="+91 98765…" {...f('phone')} type="tel" />
          <Select label="Currency" {...f('currency')}>
            <option value="INR">INR (₹)</option>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="GST number" placeholder="22AAAAA0000A1Z5" {...f('gstNumber')} />
          <Input label="PAN number" placeholder="AAAAA0000A" {...f('panNumber')} />
        </div>
        <Input label="Address" placeholder="Registered address" {...f('address')} />
      </form>
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </Modal>
  );
}

function AddUserToFirmModal({ open, onClose, firmId, allUsers }) {
  const [form, setForm] = useState({ userId: '', roleInFirm: 'staff', canCollect: false });
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const submit = async () => {
    if (!form.userId) { toast.error('Select a user'); return; }
    setLoading(true);
    try {
      await firmAPI.addUser(firmId, form);
      toast.success('User added to firm');
      onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add User to Firm" size="sm"
      footer={<>
        <Button variant="default" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={loading} onClick={submit}>Add user</Button>
      </>}>
      <div className="space-y-3">
        <Select label="User" value={form.userId} onChange={e => setForm(p => ({ ...p, userId: e.target.value }))}>
          <option value="">— Select user —</option>
          {allUsers.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
        </Select>
        <Select label="Role in firm" value={form.roleInFirm} onChange={e => setForm(p => ({ ...p, roleInFirm: e.target.value }))}>
          <option value="firm_admin">Firm Admin</option>
          <option value="accountant">Accountant</option>
          <option value="collection_boy">Collection Boy</option>
          <option value="staff">Staff</option>
          <option value="viewer">Viewer</option>
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={form.canCollect}
            onChange={e => setForm(p => ({ ...p, canCollect: e.target.checked }))}
            className="rounded border-slate-300 text-violet-600 focus:ring-violet-400" />
          Allow market collection (collection boy access)
        </label>
      </div>
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </Modal>
  );
}

export default function FirmsPage() {
  const { firms: ctxFirms, switchFirm, loadMe, isAdmin } = useAuth();
  const toast = useToast();
  const [firms, setFirms] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [firmUsers, setFirmUsers] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [firmModal, setFirmModal] = useState(false);
  const [editFirm, setEditFirm] = useState(null);
  const [addUserFirmId, setAddUserFirmId] = useState(null);
  const [expandedFirm, setExpandedFirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [fRes, uRes] = await Promise.all([firmAPI.list(), userAPI.list()]);
      setFirms(fRes.data || []);
      setAllUsers(uRes.data || []);
    } catch (_) {
      setLoadError(true);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadFirmUsers = async (firmId) => {
    if (firmUsers[firmId]) return;
    try {
      const res = await firmAPI.getUsers(firmId);
      setFirmUsers(p => ({ ...p, [firmId]: res.data }));
    } catch (_) {}
  };

  const handleSaveFirm = async (form) => {
    if (editFirm) {
      await firmAPI.update(editFirm.id, form);
      toast.success('Firm updated');
    } else {
      await firmAPI.create(form);
      toast.success('Firm created');
    }
    await load();
    await loadMe();
  };

  const toggleExpand = (firmId) => {
    if (expandedFirm === firmId) { setExpandedFirm(null); return; }
    setExpandedFirm(firmId);
    loadFirmUsers(firmId);
  };

  const roleColor = (role) => ({ firm_admin: 'violet', accountant: 'blue', collection_boy: 'green', staff: 'gray', viewer: 'gray' }[role] || 'gray');

  if (!isAdmin) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-slate-500">Admin access required</p>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800">Firms</h1>
          <p className="text-sm text-slate-500">{firms.length} firm{firms.length !== 1 ? 's' : ''} · Add multiple firms per subscription plan</p>
        </div>
        <Button variant="primary" onClick={() => { setEditFirm(null); setFirmModal(true); }}>+ Add firm</Button>
      </div>

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> :
       loadError ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-slate-500 text-sm">Failed to load firms.</p>
          <Button size="sm" variant="default" onClick={load}>Retry</Button>
        </div>
      ) : (
        firms.length === 0
          ? <EmptyState icon="🏢" title="No firms yet" description="Your first firm was created automatically. Add more based on your plan." action={<Button variant="primary" onClick={() => setFirmModal(true)}>Add firm</Button>} />
          : (
            <div className="space-y-3">
              {firms.map(firm => (
                <Card key={firm.id} className="overflow-hidden">
                  <div className="flex items-center gap-4 p-5">
                    <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-sm flex-shrink-0">
                      {getInitials(firm.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800">{firm.name}</p>
                        <Badge color={firm.is_active ? 'green' : 'gray'}>{firm.is_active ? 'Active' : 'Inactive'}</Badge>
                        {firm.gst_number && <Badge color="blue">GST: {firm.gst_number}</Badge>}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{firm.phone || ''} {firm.address ? '· ' + firm.address : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                      <Button size="sm" variant="ghost" onClick={() => switchFirm(firm)}>Switch to</Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleExpand(firm.id)}>
                        {expandedFirm === firm.id ? 'Collapse ▲' : 'Users ▼'}
                      </Button>
                      <Button size="sm" variant="default" onClick={() => { setEditFirm(firm); setFirmModal(true); }}>Edit</Button>
                    </div>
                  </div>

                  {expandedFirm === firm.id && (
                    <div className="border-t border-slate-100 px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Team members</p>
                        <Button size="sm" variant="primary" onClick={() => setAddUserFirmId(firm.id)}>+ Add user</Button>
                      </div>
                      {!firmUsers[firm.id] ? (
                        <div className="flex justify-center py-4"><Spinner /></div>
                      ) : firmUsers[firm.id].length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-3">No users assigned</p>
                      ) : (
                        <div className="space-y-2">
                          {firmUsers[firm.id].map(u => (
                            <div key={u.id} className="flex items-center gap-3 py-1.5">
                              <Avatar name={u.full_name} size="sm" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700">{u.full_name}</p>
                                <p className="text-xs text-slate-400">{u.email}</p>
                              </div>
                              <div className="flex gap-1.5 flex-wrap justify-end">
                                <Badge color={roleColor(u.role_in_firm)}>{u.role_in_firm?.replace('_', ' ')}</Badge>
                                {u.can_collect && <Badge color="green">Collector</Badge>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )
      )}

      <FirmModal open={firmModal} onClose={() => { setFirmModal(false); setEditFirm(null); }} onSave={handleSaveFirm} initial={editFirm} />
      <AddUserToFirmModal open={!!addUserFirmId} onClose={() => setAddUserFirmId(null)} firmId={addUserFirmId} allUsers={allUsers} />
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </div>
  );
}
