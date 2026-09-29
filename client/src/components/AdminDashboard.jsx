import React, { useState, useEffect } from 'react';
import { Users, Zap, Shield, FileText, Sliders, RefreshCw, Power, Edit2, Save, X } from 'lucide-react';

export default function AdminDashboard({ token }) {
  const [meters, setMeters] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edit Tariff Modal State
  const [editingTariff, setEditingTariff] = useState(null);
  const [editRate, setEditRate] = useState('');
  const [editFixed, setEditFixed] = useState('');

  const fetchAdminData = async () => {
    try {
      setLoading(true);

      // 1. Fetch meters
      const mRes = await fetch('http://localhost:5000/api/meters/all', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const mData = await mRes.json();
      setMeters(mData.meters || []);

      // 2. Fetch tariffs
      const tRes = await fetch('http://localhost:5000/api/tariffs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const tData = await tRes.json();
      setTariffs(tData.tariffs || []);

      // 3. Fetch audit logs
      const aRes = await fetch('http://localhost:5000/api/audit', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const aData = await aRes.json();
      setAuditLogs(aData.logs || []);

    } catch (err) {
      console.error('Fetch admin data error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchAdminData();
  }, [token]);

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

  if (loading && meters.length === 0) {
    return <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Loading Admin Console...</div>;
  }

  const activeCount = meters.filter(m => m.power_state === 'CONNECTED').length;
  const cutoffCount = meters.filter(m => m.power_state === 'DISCONNECTED').length;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* System KPIs Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '12px', fontWeight: '700' }}>
            <span>TOTAL METERS REGISTERED</span>
            <Users size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: '#f8fafc', marginTop: '8px' }}>
            {meters.length}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '12px', fontWeight: '700' }}>
            <span>ACTIVE CONNECTED RELAYS</span>
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

      {/* Meters & Relay Management Grid */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc', marginBottom: '16px' }}>Smart Meters & Customer Accounts</h3>

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

      {/* Edit Tariff Modal */}
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
