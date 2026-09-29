import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import CustomerDashboard from './components/CustomerDashboard';
import AdminDashboard from './components/AdminDashboard';
import AuthModal from './components/AuthModal';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('leco_token') || '');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-login with demo account if token missing
  useEffect(() => {
    if (!token) {
      handleSelectDemoUser('consumer@leco.lk');
    } else {
      fetchCurrentUser(token);
    }
  }, []);

  const fetchCurrentUser = async (authToken) => {
    try {
      setIsRefreshing(true);
      const res = await fetch('http://localhost:5000/api/auth/me', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      const data = await res.json();
      if (res.ok && data.user) {
        setCurrentUser(data.user);
      } else {
        // Token expired/invalid, login default
        handleSelectDemoUser('consumer@leco.lk');
      }
    } catch (err) {
      console.error('Fetch me error:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSelectDemoUser = async (email) => {
    try {
      setIsRefreshing(true);
      const res = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'Password123!' })
      });

      const data = await res.json();
      if (res.ok && data.token) {
        setToken(data.token);
        localStorage.setItem('leco_token', data.token);
        setCurrentUser(data.user);
      }
    } catch (err) {
      console.error('Demo switch error:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = () => {
    setToken('');
    setCurrentUser(null);
    localStorage.removeItem('leco_token');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        currentUser={currentUser}
        onSelectDemoUser={handleSelectDemoUser}
        onLogout={handleLogout}
        onRefresh={() => fetchCurrentUser(token)}
        isRefreshing={isRefreshing}
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
          <div style={{ textAlign: 'center', padding: '100px 20px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#f8fafc', marginBottom: '12px' }}>
              Welcome to LECO Smart Grid Electricity Platform
            </h2>
            <p style={{ color: '#94a3b8', marginBottom: '20px' }}>
              Please sign in or select a demo account above to continue.
            </p>
            <button onClick={() => setIsAuthOpen(true)} className="btn-primary">
              Sign In / Register
            </button>
          </div>
        )}
      </main>

      <footer style={{ borderTop: '1px solid var(--border-color)', padding: '20px 24px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
        LECO Smart Grid Prepaid Electricity Platform • EE5206 Software Group Project Baseline • 2026
      </footer>

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={(data) => {
          setToken(data.token);
          localStorage.setItem('leco_token', data.token);
          setCurrentUser(data.user);
        }}
      />
    </div>
  );
}
