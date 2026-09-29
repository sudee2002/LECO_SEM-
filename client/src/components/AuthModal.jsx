import React, { useState } from 'react';
import { X, Lock, Mail, User, KeyRound } from 'lucide-react';

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('customer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin ? 'http://localhost:5000/api/auth/login' : 'http://localhost:5000/api/auth/register';
    const body = isLogin ? { email, password } : { name, email, password, role };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed.');

      if (onAuthSuccess) onAuthSuccess(data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '28px', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
          <X size={18} />
        </button>

        <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#f8fafc', marginBottom: '6px' }}>
          {isLogin ? 'Sign In to LECO SEM' : 'Register Customer Account'}
        </h3>
        <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '20px' }}>
          {isLogin ? 'Enter your credentials to manage prepaid wallet & meter telemetry' : 'Create a new smart meter customer account'}
        </p>

        {error && (
          <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fb7185', padding: '10px', borderRadius: '8px', fontSize: '12px', marginBottom: '14px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {!isLogin && (
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Full Name</label>
              <input
                type="text"
                placeholder="Sunil Perera"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
              />
            </div>
          )}

          <div>
            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Email Address</label>
            <input
              type="email"
              placeholder="consumer@leco.lk"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary" style={{ justifyContent: 'center', padding: '12px', marginTop: '10px' }}>
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
          {isLogin ? "Don't have an account? " : "Already registered? "}
          <button
            onClick={() => setIsLogin(!isLogin)}
            style={{ background: 'transparent', border: 'none', color: '#10b981', fontWeight: '600', cursor: 'pointer' }}
          >
            {isLogin ? 'Register' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}
