import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Card } from '../components/common';
import TwoFactorModal from '../components/security/TwoFactorModal';

export default function SecurityPage() {
  const { user } = useAuth();
  const [twofaOpen, setTwofaOpen] = useState(false);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Security</h1>
        <p className="text-sm text-slate-500">Protect your account access.</p>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">Two-factor authentication</p>
            <p className="text-sm font-semibold text-slate-800">Authenticator app (TOTP)</p>
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

      <TwoFactorModal open={twofaOpen} onClose={() => setTwofaOpen(false)} enabled={!!user?.twofaEnabled} />
    </div>
  );
}

