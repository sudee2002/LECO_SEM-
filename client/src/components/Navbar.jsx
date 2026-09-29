import React from 'react';
import { Zap, Shield, User, LogOut, Activity, RefreshCw } from 'lucide-react';

export default function Navbar({ currentUser, onSelectDemoUser, onLogout, onRefresh, isRefreshing }) {
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

        {/* Quick Role Switcher Bar (Demo Feature) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(15, 23, 42, 0.8)', padding: '6px 12px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', marginRight: '4px' }}>DEMO SWITCH:</span>
          
          <button
            onClick={() => onSelectDemoUser('consumer@leco.lk')}
            className="btn-secondary"
            style={{
              padding: '5px 10px',
              fontSize: '12px',
              borderColor: currentUser?.email === 'consumer@leco.lk' ? '#10b981' : 'transparent',
              background: currentUser?.email === 'consumer@leco.lk' ? 'rgba(16, 185, 129, 0.2)' : 'transparent'
            }}
          >
            <User size={14} color="#34d399" /> Sunil (Consumer)
          </button>

          <button
            onClick={() => onSelectDemoUser('lowbalance@leco.lk')}
            className="btn-secondary"
            style={{
              padding: '5px 10px',
              fontSize: '12px',
              borderColor: currentUser?.email === 'lowbalance@leco.lk' ? '#f59e0b' : 'transparent',
              background: currentUser?.email === 'lowbalance@leco.lk' ? 'rgba(245, 158, 11, 0.2)' : 'transparent'
            }}
          >
            <Activity size={14} color="#fbbf24" /> Kamal (Low Bal)
          </button>

          <button
            onClick={() => onSelectDemoUser('admin@leco.lk')}
            className="btn-secondary"
            style={{
              padding: '5px 10px',
              fontSize: '12px',
              borderColor: currentUser?.email === 'admin@leco.lk' ? '#3b82f6' : 'transparent',
              background: currentUser?.email === 'admin@leco.lk' ? 'rgba(59, 130, 246, 0.2)' : 'transparent'
            }}
          >
            <Shield size={14} color="#60a5fa" /> System Admin
          </button>
        </div>

        {/* User Badge & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={onRefresh}
            title="Refresh Status"
            className="btn-secondary"
            style={{ padding: '8px 12px' }}
          >
            <RefreshCw size={16} className={isRefreshing ? 'spin' : ''} />
          </button>

          {currentUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>{currentUser.name}</div>
                <div style={{ fontSize: '11px', color: currentUser.role === 'admin' ? '#60a5fa' : '#34d399', textTransform: 'uppercase', fontWeight: '600' }}>
                  {currentUser.role} • {currentUser.accountNumber}
                </div>
              </div>
              <button
                onClick={onLogout}
                className="btn-secondary"
                style={{ padding: '8px 12px', color: '#f43f5e' }}
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
