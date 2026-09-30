import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import CustomerDashboard from './components/CustomerDashboard';
import AdminDashboard from './components/AdminDashboard';
import AuthModal from './components/AuthModal';
import { Zap, Activity, CreditCard, ArrowRight, Cpu } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState('');
  const [isAuthOpen, setIsAuthOpen] = useState(true); // Open Sign In modal on startup by default
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchCurrentUser = async (authToken) => {
    try {
      setIsRefreshing(true);
      const res = await fetch('http://localhost:5000/api/auth/me', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      const data = await res.json();
      if (res.ok && data.user) {
        setCurrentUser(data.user);
        setIsAuthOpen(false);
      } else {
        handleLogout();
      }
    } catch (err) {
      console.error('Fetch user session error:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = () => {
    setToken('');
    setCurrentUser(null);
    localStorage.removeItem('leco_token');
    setIsAuthOpen(true); // Return to Sign In modal on logout
  };

  const handleAuthSuccess = (data) => {
    setToken(data.token);
    localStorage.setItem('leco_token', data.token);
    setCurrentUser(data.user);
    setIsAuthOpen(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        currentUser={currentUser}
        onLogout={handleLogout}
        onRefresh={() => fetchCurrentUser(token)}
        isRefreshing={isRefreshing}
        onOpenAuth={() => setIsAuthOpen(true)}
      />

      <main style={{ flex: 1, padding: '0 24px 40px' }}>
        {currentUser ? (
          currentUser.role === 'admin' ? (
            <AdminDashboard token={token} />
          ) : (
            <CustomerDashboard
              currentUser={currentUser}
              token={token}
              onDataChange={() => fetchCurrentUser(token)}
            />
          )
        ) : (
          /* Landing Page View when logged out */
          <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
            
            {/* Hero Section */}
            <div className="glass-panel" style={{ padding: '56px 32px', textAlign: 'center', background: 'radial-gradient(circle at top, rgba(16, 185, 129, 0.15) 0%, rgba(15, 23, 42, 0.8) 70%)' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 0 24px rgba(16, 185, 129, 0.5)' }}>
                <Zap size={36} color="#ffffff" />
              </div>

              <h1 style={{ fontSize: '36px', fontWeight: '800', background: 'linear-gradient(90deg, #ffffff 0%, #cbd5e1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '16px' }}>
                LECO Smart Grid Prepaid Electricity Platform
              </h1>
              
              <p style={{ fontSize: '16px', color: '#94a3b8', maxWidth: '680px', margin: '0 auto 28px', lineHeight: '1.6' }}>
                Unified smart metering telemetry, automated relay cutoff management, instant wallet top-ups, and energy analytics platform.
              </p>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button onClick={() => setIsAuthOpen(true)} className="btn-primary" style={{ padding: '14px 32px', fontSize: '15px' }}>
                  Sign In to Platform <ArrowRight size={18} />
                </button>
              </div>
            </div>

            {/* Feature Highlights Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
              
              <div className="glass-panel" style={{ padding: '24px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <Activity size={22} color="#34d399" />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc', marginBottom: '8px' }}>Smart Telemetry</h3>
                <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5' }}>
                  Real-time kWh consumption tracking, power state monitoring, and automated relay status updates.
                </p>
              </div>

              <div className="glass-panel" style={{ padding: '24px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(6, 182, 212, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <CreditCard size={22} color="#38bdf8" />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc', marginBottom: '8px' }}>Prepaid Wallet</h3>
                <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5' }}>
                  Seamless digital wallet top-ups with instant balance calculations based on Sri Lankan block tariffs.
                </p>
              </div>

              <div className="glass-panel" style={{ padding: '24px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <Cpu size={22} color="#c084fc" />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc', marginBottom: '8px' }}>AI Energy Insights</h3>
                <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5' }}>
                  Predictive days remaining forecasting and intelligent account-aware virtual energy assistant.
                </p>
              </div>

            </div>

          </div>
        )}
      </main>

      <footer style={{ borderTop: '1px solid var(--border-color)', padding: '20px 24px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
        LECO Smart Grid Prepaid Electricity Platform • EE5206 Software Group Project Baseline • 2026
      </footer>

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
}
