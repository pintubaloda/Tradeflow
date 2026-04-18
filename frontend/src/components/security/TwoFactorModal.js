import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../services/api';
import { Button, Card, Input, Modal, Spinner, Toast, useToast } from '../common';

export default function TwoFactorModal({ open, onClose, enabled }) {
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

