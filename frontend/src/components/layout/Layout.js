import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { classNames, getInitials } from '../../utils/helpers';
import { Avatar } from '../common';

const NAV = [
  { to: '/',              label: 'Dashboard',          icon: '▦',  always: true },
  { to: '/vendor-ledger', label: 'Vendor Ledger',      icon: '📒', module: 'vendor_ledger' },
  { to: '/collection',    label: 'Market Collection',  icon: '🤝', module: 'market_collection' },
  { to: '/reports',       label: 'Reports',            icon: '📊', module: 'reports' },
  { to: '/firms',         label: 'Firms',              icon: '🏢', admin: true },
  { to: '/users',         label: 'Team',               icon: '👥', admin: true },
  { to: '/subscriptions', label: 'Subscriptions',      icon: '⚡', admin: true },
  { to: '/security',      label: 'Security',           icon: 'S',    always: true },
];

function FirmSwitcher({ collapsed }) {
  const { firms, currentFirm, switchFirm } = useAuth();
  const [open, setOpen] = useState(false);
  if (!firms?.length) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={classNames(
          'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl',
          'bg-violet-50 hover:bg-violet-100 border border-violet-100 transition-all text-left'
        )}>
        <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {getInitials(currentFirm?.name || 'F')}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-violet-800 truncate">{currentFirm?.name || 'Select firm'}</p>
              <p className="text-xs text-violet-400">Active firm</p>
            </div>
            <svg className={classNames('w-3.5 h-3.5 text-violet-400 transition-transform', open && 'rotate-180')} viewBox="0 0 12 12" fill="none">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </>
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-lg z-20 overflow-hidden">
          {firms.map(f => (
            <button key={f.id} onClick={() => { switchFirm(f); setOpen(false); }}
              className={classNames(
                'w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors text-xs',
                currentFirm?.id === f.id && 'bg-violet-50'
              )}>
              <div className="w-6 h-6 rounded-md bg-violet-100 flex items-center justify-center text-violet-600 text-xs font-bold flex-shrink-0">
                {getInitials(f.name)}
              </div>
              <span className="font-medium text-slate-700 truncate">{f.name}</span>
              {currentFirm?.id === f.id && <span className="ml-auto text-violet-500">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const { user, hasModule, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const content = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={classNames('flex items-center gap-2.5 px-4 py-4 border-b border-slate-100', collapsed && 'justify-center')}>
        <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">T</span>
        </div>
        {!collapsed && <span className="font-bold text-slate-800 text-base tracking-tight">TradeFlow</span>}
      </div>

      {/* Firm Switcher */}
      <div className="px-3 py-3 border-b border-slate-100">
        <FirmSwitcher collapsed={collapsed} />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(item => {
          const show = item.always || (item.module && hasModule(item.module)) || (item.admin && isAdmin);
          if (!show) return null;
          return (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => classNames(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                isActive
                  ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
                collapsed && 'justify-center'
              )}>
              <span className="text-base leading-none flex-shrink-0">{item.icon}</span>
              {!collapsed && item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-slate-100">
        <div className={classNames('flex items-center gap-2.5', collapsed && 'justify-center')}>
          <Avatar name={user?.fullName} size="sm" />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">{user?.fullName}</p>
              <p className="text-xs text-slate-400 truncate">{user?.role?.replace('_', ' ')}</p>
            </div>
          )}
          {!collapsed && (
            <button onClick={handleLogout} className="text-slate-400 hover:text-slate-600 transition-colors text-xs p-1 rounded hover:bg-slate-100" title="Logout">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 8H3M3 8l2-2M3 8l2 2M6 4V3a1 1 0 011-1h5a1 1 0 011 1v10a1 1 0 01-1 1H7a1 1 0 01-1-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={classNames(
        'hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-30 bg-white border-r border-slate-100 transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}>
        {/* Collapse toggle */}
        <button onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-6 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm hover:shadow z-10 transition-shadow">
          <svg className={classNames('w-3 h-3 text-slate-500 transition-transform', collapsed && 'rotate-180')} viewBox="0 0 12 12" fill="none">
            <path d="M7 2L3 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {content}
      </aside>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-xl">{content}</aside>
        </div>
      )}
    </>
  );
}

export default function Layout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { currentFirm } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      {/* Topbar for mobile */}
      <header className={classNames(
        'lg:hidden fixed top-0 left-0 right-0 z-20 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3'
      )}>
        <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
        <div className="flex-1 flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-violet-600 flex items-center justify-center">
            <span className="text-white font-bold text-xs">T</span>
          </div>
          <span className="font-bold text-slate-800 text-sm">TradeFlow</span>
        </div>
        {currentFirm && <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-lg truncate max-w-[120px]">{currentFirm.name}</span>}
      </header>

      {/* Main content */}
      <main className={classNames(
        'transition-all duration-200 pt-0 lg:pt-0',
        collapsed ? 'lg:ml-16' : 'lg:ml-56',
        'mt-14 lg:mt-0'
      )}>
        <div className="p-4 lg:p-6 min-h-screen">
          {children}
        </div>
      </main>
    </div>
  );
}
