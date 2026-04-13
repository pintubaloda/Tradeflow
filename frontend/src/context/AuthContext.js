import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null);
  const [firms, setFirms]             = useState([]);
  const [activeModules, setActiveModules] = useState([]);
  const [currentFirm, setCurrentFirm] = useState(null);
  const [loading, setLoading]         = useState(true);

  // FIX BUG 12: Use a ref so the logout listener always calls the current version
  const logoutRef = useRef(null);

  const loadMe = useCallback(async () => {
    try {
      const { data } = await authAPI.me();
      setUser(data.user);
      setFirms(data.firms);
      setActiveModules(data.activeModules);
      setCurrentFirm(prev => {
        // Keep current firm if it's still accessible; else fall back to saved or first
        if (prev && data.firms.find(f => f.id === prev.id)) return prev;
        const savedFirmId = localStorage.getItem('currentFirmId');
        return data.firms.find(f => f.id === savedFirmId) || data.firms[0] || null;
      });
    } catch (_) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    } finally {
      setLoading(false);
    }
  }, []);

  // FIX BUG 12: wrap logout in useCallback so it's stable and the ref stays current
  const logout = useCallback(async () => {
    try {
      const rt = localStorage.getItem('refreshToken');
      if (rt) await authAPI.logout({ refreshToken: rt });
    } catch (_) {}
    localStorage.clear();
    setUser(null);
    setFirms([]);
    setCurrentFirm(null);
    setActiveModules([]);
    setLoading(false);
  }, []);

  // Keep ref in sync so the event listener always calls the latest logout
  useEffect(() => { logoutRef.current = logout; }, [logout]);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) loadMe();
    else setLoading(false);

    // FIX BUG 12: use ref to avoid stale closure
    const onLogout = () => logoutRef.current?.();
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, [loadMe]);

  // FIX BUG 11: login only sets state once via loadMe; don't double-set from login response
  const login = async (email, password) => {
    const { data } = await authAPI.login({ email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    // Persist intended firm before loadMe runs
    const firstFirm = (data.user.firms || [])[0];
    if (firstFirm) localStorage.setItem('currentFirmId', firstFirm.id);
    // Single source of truth: loadMe fetches full state
    await loadMe();
    return data;
  };

  const switchFirm = useCallback((firm) => {
    setCurrentFirm(firm);
    localStorage.setItem('currentFirmId', firm.id);
  }, []);

  const hasModule      = useCallback((key) => activeModules.includes(key), [activeModules]);
  const isAdmin        = user?.role === 'tenant_admin' || user?.role === 'firm_admin';
  const isCollectionBoy = user?.role === 'collection_boy';

  return (
    <AuthContext.Provider value={{
      user, firms, currentFirm, activeModules, loading,
      login, logout, switchFirm, loadMe,
      hasModule, isAdmin, isCollectionBoy,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
