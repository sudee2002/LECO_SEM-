import React from 'react';
import { Zap, Shield, User, LogOut, RefreshCw, LogIn } from 'lucide-react';

export default function Navbar({ currentUser, onLogout, onRefresh, isRefreshing, onOpenAuth }) {
  return (
    <header className="glass-panel" style={{ borderRadius: '0 0 16px 16px', borderTop: 'none', padding: '14px 24px', marginBottom: '24px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 16px rgba(16, 185, 129, 0.4)'
          }}>
            <Zap size={24} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #ffffff 0%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              LECO SMART GRID
            </div>
            <div style={{ fontSize: '11px', color: '#10b981', fontWeight: '600', letterSpacing: '0.05em' }}>
              PREPAID ELECTRICITY PLATFORM • EE5206
            </div>
          </div>
        </div>

        {/* User Badge & Navigation Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {currentUser ? (
            <>
              <button
                onClick={onRefresh}
                title="Refresh Dashboard"
                className="btn-secondary"
                style={{ padding: '8px 12px' }}
              >
                <RefreshCw size={16} className={isRefreshing ? 'spin' : ''} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(15, 23, 42, 0.6)', padding: '6px 14px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>{currentUser.name}</div>
                  <div style={{ fontSize: '11px', color: currentUser.role === 'admin' ? '#60a5fa' : '#34d399', textTransform: 'uppercase', fontWeight: '600' }}>
                    {currentUser.role === 'admin' ? 'System Administrator' : `Consumer • ${currentUser.accountNumber || ''}`}
                  </div>
                </div>
                <button
                  onClick={onLogout}
                  className="btn-secondary"
                  style={{ padding: '8px 12px', color: '#f43f5e' }}
                  title="Logout"
                >
                  <LogOut size={16} /> Logout
                </button>
              </div>
            </>
          ) : (
            <button onClick={onOpenAuth} className="btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>
              <LogIn size={16} /> Sign In
            </button>
          )}
        </div>

      </div>
    </header>
  );
}
