import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import { LoginPage, RegisterPage } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import VendorLedger from './pages/VendorLedger';
import MarketCollection from './pages/MarketCollection';
import FirmsPage from './pages/Firms';
import { TeamPage, SubscriptionsPage } from './pages/TeamAndSubscriptions';
import Reports from './pages/Reports';
import SecurityPage from './pages/Security';
import { Spinner } from './components/common';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-violet-600 flex items-center justify-center">
          <span className="text-white font-bold">T</span>
        </div>
        <Spinner size="md" />
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/"             element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/vendor-ledger" element={<ProtectedRoute><VendorLedger /></ProtectedRoute>} />
          <Route path="/collection"   element={<ProtectedRoute><MarketCollection /></ProtectedRoute>} />
          <Route path="/firms"        element={<ProtectedRoute><FirmsPage /></ProtectedRoute>} />
          <Route path="/users"        element={<ProtectedRoute><TeamPage /></ProtectedRoute>} />
          <Route path="/subscriptions" element={<ProtectedRoute><SubscriptionsPage /></ProtectedRoute>} />
          <Route path="/security"     element={<ProtectedRoute><SecurityPage /></ProtectedRoute>} />
          <Route path="/reports"      element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
