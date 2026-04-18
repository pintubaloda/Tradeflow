import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Input, useToast, Toast } from '../components/common';
import { authAPI } from '../services/api';

function AuthLayout({ children, title, subtitle }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-violet-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-200">
            <span className="text-white font-bold text-xl">T</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">{title}</h1>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xl shadow-slate-100/50 p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login, complete2faLogin } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ email: '', password: '' });
  const [otp, setOtp] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [twofaToken, setTwofaToken] = useState('');
  const [step, setStep] = useState('password'); // password | twofa
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const apkUrl =
    (typeof window !== 'undefined' && window.__TRADEFLOW_CONFIG__ && window.__TRADEFLOW_CONFIG__.ANDROID_APK_URL) ||
    process.env.REACT_APP_ANDROID_APK_URL ||
    '';

  const validate = () => {
    const e = {};
    if (step === 'password') {
      if (!form.email) e.email = 'Email required';
      if (!form.password) e.password = 'Password required';
    } else {
      if (!otp && !backupCode) e.otp = 'Enter OTP or backup code';
    }
    return e;
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    setErrors({});
    try {
      if (step === 'password') {
        const res = await login(form.email, form.password);
        if (res?.requires2fa) {
          setTwofaToken(res.twofaToken || '');
          setStep('twofa');
          toast.success('2FA required. Enter your verification code.');
          return;
        }
        navigate('/');
        return;
      }
      await complete2faLogin({ twofaToken, otp: otp || undefined, backupCode: backupCode || undefined });
      navigate('/');
    } catch (err) {
      const msg = err.response?.data?.error || 'Login failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your TradeFlow account">
      <form onSubmit={submit} className="space-y-4">
        <Input label="Email" type="email" placeholder="you@example.com"
          value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
          error={errors.email} autoFocus disabled={step === 'twofa'} />
        <Input label="Password" type="password" placeholder="••••••••"
          value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
          error={errors.password} disabled={step === 'twofa'} />
        {step === 'twofa' && (
          <>
            <Input
              label="Authenticator code"
              inputMode="numeric"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              error={errors.otp}
              autoFocus
            />
            <div className="text-xs text-slate-400 -mt-2">
              Or use a one-time backup code if you donâ€™t have your authenticator.
            </div>
            <Input
              label="Backup code (optional)"
              placeholder="A1B2C3D4E5"
              value={backupCode}
              onChange={(e) => setBackupCode(e.target.value)}
            />
            <Button
              type="button"
              variant="default"
              onClick={() => { setStep('password'); setOtp(''); setBackupCode(''); setTwofaToken(''); }}
              className="w-full"
              disabled={loading}
            >
              Back
            </Button>
          </>
        )}
        <Button type="submit" variant="primary" loading={loading} className="w-full mt-2">
          {step === 'password' ? 'Sign in' : 'Verify & sign in'}
        </Button>
      </form>
      <p className="text-center text-sm text-slate-500 mt-4">
        No account?{' '}
        <Link to="/register" className="text-violet-600 font-medium hover:underline">Create one free</Link>
      </p>
      {apkUrl ? (
        <p className="text-center text-xs text-slate-400 mt-2">
          Need the Android app?{' '}
          <a className="text-violet-600 font-medium hover:underline" href={apkUrl} target="_blank" rel="noreferrer">
            Download APK
          </a>
        </p>
      ) : null}
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </AuthLayout>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ tenantName: '', fullName: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })), error: errors[k] });

  const validate = () => {
    const e = {};
    if (!form.tenantName.trim()) e.tenantName = 'Business name required';
    if (!form.fullName.trim()) e.fullName = 'Your name required';
    if (!form.email) e.email = 'Email required';
    if (form.password.length < 8) e.password = 'At least 8 characters';
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    return e;
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    setErrors({});
    try {
      const { data } = await authAPI.register({
        tenantName: form.tenantName, fullName: form.fullName,
        email: form.email, phone: form.phone, password: form.password,
      });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      toast.success('Account created! Redirecting…');
      setTimeout(() => navigate('/'), 800);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create account" subtitle="Start your 14-day free trial — no card needed">
      <form onSubmit={submit} className="space-y-3">
        <Input label="Business / Company name" placeholder="Sharma Distributors" {...f('tenantName')} autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Your name" placeholder="Ravi Sharma" {...f('fullName')} />
          <Input label="Phone (optional)" placeholder="+91 98765…" {...f('phone')} type="tel" />
        </div>
        <Input label="Work email" type="email" placeholder="you@business.com" {...f('email')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Password" type="password" placeholder="Min 8 chars" {...f('password')} />
          <Input label="Confirm password" type="password" placeholder="••••••••" {...f('confirmPassword')} />
        </div>
        <Button type="submit" variant="primary" loading={loading} className="w-full mt-1">
          Create free account
        </Button>
        <p className="text-xs text-slate-400 text-center">By registering you agree to our Terms of Service.</p>
      </form>
      <p className="text-center text-sm text-slate-500 mt-3">
        Already have an account?{' '}
        <Link to="/login" className="text-violet-600 font-medium hover:underline">Sign in</Link>
      </p>
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </AuthLayout>
  );
}
