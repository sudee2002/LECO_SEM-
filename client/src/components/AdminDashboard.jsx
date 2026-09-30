import React, { useState, useEffect } from 'react';
import { Users, Zap, Shield, FileText, Sliders, RefreshCw, Power, Edit2, Save, X, Plus, Trash2, UserPlus, AlertTriangle } from 'lucide-react';

export default function AdminDashboard({ token, refreshKey }) {
  const [meters, setMeters] = useState([]);
  const [consumers, setConsumers] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Tariff Edit Modal State
  const [editingTariff, setEditingTariff] = useState(null);
  const [editRate, setEditRate] = useState('');
  const [editFixed, setEditFixed] = useState('');

  // Consumer CRUD State
  const [isAddConsumerOpen, setIsAddConsumerOpen] = useState(false);
  const [newConsumer, setNewConsumer] = useState({
    name: '',
    email: '',
    password: 'Password123!',
    accountNumber: '',
    meterId: '',
    location: '',
    initialBalance: '1000'
  });

  const [editingConsumer, setEditingConsumer] = useState(null);
  const [editConsumerForm, setEditConsumerForm] = useState({
    name: '',
    email: '',
    accountNumber: '',
    location: '',
    currentBalance: ''
  });

  const [deletingConsumer, setDeletingConsumer] = useState(null);
  const [formError, setFormError] = useState('');

  const [fetchError, setFetchError] = useState('');

  const fetchAdminData = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setFetchError('');

      const headers = { 'Authorization': `Bearer ${token}` };

      // Fetch all endpoints concurrently using Promise.allSettled
      const [cRes, mRes, tRes, aRes] = await Promise.allSettled([
        fetch('http://localhost:5000/api/consumers', { headers }).then(r => r.ok ? r.json() : Promise.reject(r.statusText)),
        fetch('http://localhost:5000/api/meters/all', { headers }).then(r => r.ok ? r.json() : Promise.reject(r.statusText)),
        fetch('http://localhost:5000/api/tariffs', { headers }).then(r => r.ok ? r.json() : Promise.reject(r.statusText)),
        fetch('http://localhost:5000/api/audit', { headers }).then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      ]);

      if (cRes.status === 'fulfilled') setConsumers(cRes.value.consumers || []);
      if (mRes.status === 'fulfilled') setMeters(mRes.value.meters || []);
      if (tRes.status === 'fulfilled') setTariffs(tRes.value.tariffs || []);
      if (aRes.status === 'fulfilled') setAuditLogs(aRes.value.logs || []);

      if (cRes.status === 'rejected' || mRes.status === 'rejected') {
        setFetchError('Some dashboard data could not be fetched. Check server status.');
      }

    } catch (err) {
      console.error('Fetch admin data error:', err);
      setFetchError('Failed to connect to LECO server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, [token, refreshKey]);

  // Toggle Power Relay Override
  const handleToggleRelay = async (meterId, currentPowerState) => {
    const action = currentPowerState === 'CONNECTED' ? 'DISCONNECT' : 'RECONNECT';
    try {
      const res = await fetch(`http://localhost:5000/api/meters/${meterId}/relay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action, reason: 'Admin manual override' })
      });

      if (res.ok) {
        await fetchAdminData();
      }
    } catch (err) {
      console.error('Toggle relay error:', err);
    }
  };

  // Update Tariff Slab Rate
  const handleSaveTariff = async () => {
    if (!editingTariff) return;
    try {
      const res = await fetch(`http://localhost:5000/api/tariffs/${editingTariff.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          rate_per_kwh: parseFloat(editRate),
          fixed_charge_monthly: parseFloat(editFixed)
        })
      });

      if (res.ok) {
        setEditingTariff(null);
        await fetchAdminData();
      }
    } catch (err) {
      console.error('Save tariff error:', err);
    }
  };

  // Create Consumer Handler
  const handleCreateConsumer = async (e) => {
    e.preventDefault();
    setFormError('');
    try {
      const res = await fetch('http://localhost:5000/api/consumers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newConsumer)
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Failed to create consumer');
        return;
      }

      setIsAddConsumerOpen(false);
      setNewConsumer({
        name: '',
        email: '',
        password: 'Password123!',
        accountNumber: '',
        meterId: '',
        location: '',
        initialBalance: '1000'
      });
      await fetchAdminData();
    } catch (err) {
      setFormError('Server error while creating consumer.');
    }
  };

  // Open Edit Consumer Modal
  const handleOpenEditConsumer = (c) => {
    setFormError('');
    setEditingConsumer(c);
    setEditConsumerForm({
      name: c.name || '',
      email: c.email || '',
      accountNumber: c.account_number || '',
      location: c.location || '',
      currentBalance: (c.current_balance !== undefined ? c.current_balance : 0).toString()
    });
  };

  // Update Consumer Handler
  const handleUpdateConsumer = async (e) => {
    e.preventDefault();
    if (!editingConsumer) return;
    setFormError('');

    try {
      const res = await fetch(`http://localhost:5000/api/consumers/${editingConsumer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editConsumerForm)
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Failed to update consumer');
        return;
      }

      setEditingConsumer(null);
      await fetchAdminData();
    } catch (err) {
      setFormError('Server error while updating consumer.');
    }
  };

  // Delete Consumer Handler
  const handleDeleteConsumer = async () => {
    if (!deletingConsumer) return;

    try {
      const res = await fetch(`http://localhost:5000/api/consumers/${deletingConsumer.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        setDeletingConsumer(null);
        await fetchAdminData();
      }
    } catch (err) {
      console.error('Delete consumer error:', err);
    }
  };

  if (loading && meters.length === 0 && consumers.length === 0) {
    return <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Loading Admin Console...</div>;
  }

  const activeCount = meters.filter(m => m.power_state === 'CONNECTED').length;
  const cutoffCount = meters.filter(m => m.power_state === 'DISCONNECTED').length;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* System KPIs Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
        
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '12px', fontWeight: '700' }}>
            <span>REGISTERED CONSUMERS</span>
            <Users size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: '#f8fafc', marginTop: '8px' }}>
            {consumers.length}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '12px', fontWeight: '700' }}>
            <span>ACTIVE SMART METERS</span>
            <Zap size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: '#34d399', marginTop: '8px' }}>
            {activeCount}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '12px', fontWeight: '700' }}>
            <span>CUTOFF DISCONNECTIONS</span>
            <Power size={18} color="#f43f5e" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: '#fb7185', marginTop: '8px' }}>
            {cutoffCount}
          </div>
        </div>

      </div>

      {/* Consumer Management Section */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc' }}>Consumer Account Management</h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Add, update, or remove customer accounts and manage assigned smart meters.</p>
          </div>
          <button
            onClick={() => { setFormError(''); setIsAddConsumerOpen(true); }}
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '13px' }}
          >
            <UserPlus size={16} /> Add New Consumer
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: '#94a3b8' }}>
                <th style={{ padding: '10px' }}>Name & Email</th>
                <th style={{ padding: '10px' }}>Account No</th>
                <th style={{ padding: '10px' }}>Meter ID</th>
                <th style={{ padding: '10px' }}>Location</th>
                <th style={{ padding: '10px' }}>Wallet Balance</th>
                <th style={{ padding: '10px' }}>Relay Status</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {consumers.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>No consumer accounts found.</td>
                </tr>
              ) : (
                consumers.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', color: '#e2e8f0' }}>
                    <td style={{ padding: '12px 10px' }}>
                      <div style={{ fontWeight: '700', color: '#f8fafc' }}>{c.name}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{c.email}</div>
                    </td>
                    <td style={{ padding: '12px 10px', fontFamily: 'var(--font-mono)', color: '#60a5fa' }}>{c.account_number}</td>
                    <td style={{ padding: '12px 10px', fontFamily: 'var(--font-mono)', fontWeight: '700' }}>{c.meter_id || 'N/A'}</td>
                    <td style={{ padding: '12px 10px', color: '#cbd5e1' }}>{c.location || 'Not Specified'}</td>
                    <td style={{ padding: '12px 10px', fontWeight: '700', color: (c.current_balance || 0) <= 0 ? '#fb7185' : '#34d399' }}>
                      LKR {(c.current_balance || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <span className={c.power_state === 'CONNECTED' ? 'badge-connected' : 'badge-disconnected'} style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '700' }}>
                        {c.power_state || 'DISCONNECTED'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleOpenEditConsumer(c)}
                          className="btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '11px' }}
                          title="Edit Consumer"
                        >
                          <Edit2 size={12} /> Edit
                        </button>
                        <button
                          onClick={() => setDeletingConsumer(c)}
                          className="btn-danger"
                          style={{ padding: '6px 10px', fontSize: '11px' }}
                          title="Delete Consumer"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Smart Meters & Relay Override Panel */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc', marginBottom: '16px' }}>Smart Meters & Relay Control</h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: '#94a3b8' }}>
                <th style={{ padding: '10px' }}>Meter ID</th>
                <th style={{ padding: '10px' }}>Customer Name</th>
                <th style={{ padding: '10px' }}>Account No</th>
                <th style={{ padding: '10px' }}>Balance</th>
                <th style={{ padding: '10px' }}>Power Relay</th>
                <th style={{ padding: '10px' }}>Last kWh</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {meters.map((m) => (
                <tr key={m.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', color: '#e2e8f0' }}>
                  <td style={{ padding: '12px 10px', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>{m.id}</td>
                  <td style={{ padding: '12px 10px' }}>{m.user_name}</td>
                  <td style={{ padding: '12px 10px', color: '#94a3b8' }}>{m.account_number}</td>
                  <td style={{ padding: '12px 10px', fontWeight: '700', color: (m.current_balance || 0) <= 0 ? '#fb7185' : '#34d399' }}>
                    LKR {(m.current_balance || 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '12px 10px' }}>
                    <span className={m.power_state === 'CONNECTED' ? 'badge-connected' : 'badge-disconnected'} style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '700' }}>
                      {m.power_state}
                    </span>
                  </td>
                  <td style={{ padding: '12px 10px' }}>{m.last_reading_kwh} kWh</td>
                  <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleToggleRelay(m.id, m.power_state)}
                      className={m.power_state === 'CONNECTED' ? 'btn-danger' : 'btn-primary'}
                      style={{ padding: '6px 12px', fontSize: '11px' }}
                    >
                      <Power size={12} /> {m.power_state === 'CONNECTED' ? 'Disconnect' : 'Reconnect'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sri Lankan Domestic Tariff Configurator */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc', marginBottom: '16px' }}>Sri Lankan Domestic Tariff Schedule Configurator</h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: '#94a3b8' }}>
                <th style={{ padding: '10px' }}>Slab</th>
                <th style={{ padding: '10px' }}>Category</th>
                <th style={{ padding: '10px' }}>kWh Range</th>
                <th style={{ padding: '10px' }}>Rate (LKR / kWh)</th>
                <th style={{ padding: '10px' }}>Fixed Charge (LKR/mo)</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Edit</th>
              </tr>
            </thead>
            <tbody>
              {tariffs.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', color: '#e2e8f0' }}>
                  <td style={{ padding: '12px 10px', fontWeight: '700' }}>Slab {t.id}</td>
                  <td style={{ padding: '12px 10px', color: '#94a3b8' }}>{t.category}</td>
                  <td style={{ padding: '12px 10px' }}>{t.min_kwh} - {t.max_kwh >= 99999 ? 'Above' : `${t.max_kwh}`} kWh</td>
                  <td style={{ padding: '12px 10px', fontWeight: '700', color: '#34d399' }}>LKR {t.rate_per_kwh.toFixed(2)}</td>
                  <td style={{ padding: '12px 10px' }}>LKR {t.fixed_charge_monthly.toFixed(2)}</td>
                  <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                    <button
                      onClick={() => {
                        setEditingTariff(t);
                        setEditRate(t.rate_per_kwh.toString());
                        setEditFixed(t.fixed_charge_monthly.toString());
                      }}
                      className="btn-secondary"
                      style={{ padding: '6px 10px', fontSize: '11px' }}
                    >
                      <Edit2 size={12} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Log Inspection Table */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc', marginBottom: '16px' }}>Platform Activity & Security Audit Trail</h3>

        <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: '#94a3b8' }}>
                <th style={{ padding: '8px' }}>Time</th>
                <th style={{ padding: '8px' }}>User / Role</th>
                <th style={{ padding: '8px' }}>Action</th>
                <th style={{ padding: '8px' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', color: '#cbd5e1' }}>
                  <td style={{ padding: '8px', color: '#94a3b8' }}>{new Date(log.created_at).toLocaleString()}</td>
                  <td style={{ padding: '8px' }}>{log.user_email || 'System'} ({log.actor_role})</td>
                  <td style={{ padding: '8px', fontWeight: '700', color: '#60a5fa' }}>{log.action}</td>
                  <td style={{ padding: '8px' }}>{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD CONSUMER MODAL */}
      {isAddConsumerOpen && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '24px', position: 'relative' }}>
            <button onClick={() => setIsAddConsumerOpen(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
              <X size={18} />
            </button>

            <h4 style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserPlus size={20} color="#3b82f6" /> Add New Consumer Account
            </h4>

            {formError && (
              <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid #f43f5e', padding: '10px', borderRadius: '8px', color: '#fb7185', fontSize: '12px', marginBottom: '14px' }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateConsumer}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Nimal Perera"
                  value={newConsumer.name}
                  onChange={(e) => setNewConsumer({ ...newConsumer, name: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. nimal@leco.lk"
                  value={newConsumer.email}
                  onChange={(e) => setNewConsumer({ ...newConsumer, email: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Password *</label>
                <input
                  type="password"
                  required
                  value={newConsumer.password}
                  onChange={(e) => setNewConsumer({ ...newConsumer, password: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Account No (Optional)</label>
                  <input
                    type="text"
                    placeholder="Auto-generated"
                    value={newConsumer.accountNumber}
                    onChange={(e) => setNewConsumer({ ...newConsumer, accountNumber: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Meter ID (Optional)</label>
                  <input
                    type="text"
                    placeholder="Auto-generated"
                    value={newConsumer.meterId}
                    onChange={(e) => setNewConsumer({ ...newConsumer, meterId: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Installation Location</label>
                <input
                  type="text"
                  placeholder="e.g. No. 100, Main Street, Negombo"
                  value={newConsumer.location}
                  onChange={(e) => setNewConsumer({ ...newConsumer, location: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Initial Wallet Balance (LKR)</label>
                <input
                  type="number"
                  placeholder="1000"
                  value={newConsumer.initialBalance}
                  onChange={(e) => setNewConsumer({ ...newConsumer, initialBalance: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setIsAddConsumerOpen(false)} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  <Plus size={16} /> Create Consumer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CONSUMER MODAL */}
      {editingConsumer && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '24px', position: 'relative' }}>
            <button onClick={() => setEditingConsumer(null)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
              <X size={18} />
            </button>

            <h4 style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Edit2 size={20} color="#3b82f6" /> Edit Consumer Account
            </h4>

            {formError && (
              <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid #f43f5e', padding: '10px', borderRadius: '8px', color: '#fb7185', fontSize: '12px', marginBottom: '14px' }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleUpdateConsumer}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Full Name</label>
                <input
                  type="text"
                  required
                  value={editConsumerForm.name}
                  onChange={(e) => setEditConsumerForm({ ...editConsumerForm, name: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Email Address</label>
                <input
                  type="email"
                  required
                  value={editConsumerForm.email}
                  onChange={(e) => setEditConsumerForm({ ...editConsumerForm, email: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Account Number</label>
                <input
                  type="text"
                  required
                  value={editConsumerForm.accountNumber}
                  onChange={(e) => setEditConsumerForm({ ...editConsumerForm, accountNumber: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Installation Location</label>
                <input
                  type="text"
                  value={editConsumerForm.location}
                  onChange={(e) => setEditConsumerForm({ ...editConsumerForm, location: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Wallet Balance (LKR)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editConsumerForm.currentBalance}
                  onChange={(e) => setEditConsumerForm({ ...editConsumerForm, currentBalance: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setEditingConsumer(null)} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  <Save size={16} /> Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONSUMER CONFIRMATION MODAL */}
      {deletingConsumer && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '24px', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(244, 63, 94, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <AlertTriangle size={24} color="#f43f5e" />
            </div>

            <h4 style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc', marginBottom: '8px' }}>
              Delete Consumer Account?
            </h4>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px' }}>
              Are you sure you want to permanently delete consumer <strong>{deletingConsumer.name}</strong> ({deletingConsumer.email})? This will delete all attached smart meters, readings, and wallet data.
            </p>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setDeletingConsumer(null)} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                Cancel
              </button>
              <button onClick={handleDeleteConsumer} className="btn-danger" style={{ flex: 1, justifyContent: 'center' }}>
                <Trash2 size={16} /> Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TARIFF MODAL */}
      {editingTariff && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '24px', position: 'relative' }}>
            <button onClick={() => setEditingTariff(null)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
              <X size={18} />
            </button>

            <h4 style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc', marginBottom: '16px' }}>
              Edit Tariff Slab {editingTariff.id} ({editingTariff.min_kwh}-{editingTariff.max_kwh} kWh)
            </h4>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Unit Rate (LKR / kWh)</label>
              <input
                type="number"
                value={editRate}
                onChange={(e) => setEditRate(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Fixed Monthly Charge (LKR)</label>
              <input
                type="number"
                value={editFixed}
                onChange={(e) => setEditFixed(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleSaveTariff} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                <Save size={16} /> Save Tariff
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
