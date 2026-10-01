import React, { useState, useEffect } from 'react';
import { Users, Zap, Sliders, Power, Edit2, Save, X, Plus, Trash2, UserPlus, AlertTriangle, CheckCircle, Calculator, Layers } from 'lucide-react';

function calculateClientTariff(kwh, tariffList) {
  const consumption = Math.max(0, parseFloat(kwh) || 0);
  if (!tariffList || tariffList.length === 0) return null;

  const groups = {};
  tariffList.forEach(t => {
    const g = t.tariffGroup || t.tariff_group || 'DOMESTIC_0_60';
    if (!groups[g]) groups[g] = [];
    groups[g].push(t);
  });

  let selectedGroup = null;
  for (const [g, slabs] of Object.entries(groups)) {
    const minC = Math.min(...slabs.map(s => Number(s.groupMinConsumption ?? s.group_min_consumption ?? 0)));
    const maxVals = slabs.map(s => s.groupMaxConsumption ?? s.group_max_consumption);
    const hasNullMax = maxVals.some(v => v === null || v === undefined);
    const maxC = hasNullMax ? Infinity : Math.max(...maxVals.map(v => Number(v || 0)));

    if (consumption >= minC && consumption <= maxC) {
      selectedGroup = g;
      break;
    }
  }

  if (!selectedGroup) {
    const keys = Object.keys(groups);
    if (consumption > 180) selectedGroup = keys.find(k => k.includes('180') || k.includes('ABOVE') || k.includes('C')) || keys[keys.length - 1];
    else if (consumption > 60) selectedGroup = keys.find(k => k.includes('61') || k.includes('B')) || keys[1] || keys[0];
    else selectedGroup = keys[0];
  }

  const groupSlabs = (groups[selectedGroup] || []).sort((a, b) => {
    const minA = Number(a.slabMin ?? a.slab_min ?? 0);
    const minB = Number(b.slabMin ?? b.slab_min ?? 0);
    return minA - minB;
  });

  const breakdown = [];
  let totalEnergy = 0;

  for (const s of groupSlabs) {
    const sMin = Number(s.slabMin ?? s.slab_min ?? 0);
    const sMaxRaw = s.slabMax ?? s.slab_max;
    const sMax = sMaxRaw !== null && sMaxRaw !== undefined ? Number(sMaxRaw) : null;

    const blockStart = sMin > 0 ? sMin - 1 : 0;
    const capacity = sMax !== null ? (sMax - blockStart) : Infinity;

    const units = Math.max(0, Math.min(consumption - blockStart, capacity));
    if (units > 0) {
      const rate = Number(s.energyRate ?? s.energy_rate ?? s.rate_per_kwh ?? 0);
      const amount = parseFloat((units * rate).toFixed(2));
      totalEnergy += amount;

      const rangeLabel = sMax !== null ? `${sMin}–${sMax}` : `Above ${blockStart}`;
      breakdown.push({
        range: rangeLabel,
        units: parseFloat(units.toFixed(2)),
        rate,
        amount
      });
    }
  }

  let fixedSlab = groupSlabs.find(s => {
    const sMin = Number(s.slabMin ?? s.slab_min ?? 0);
    const sMaxRaw = s.slabMax ?? s.slab_max;
    const sMax = sMaxRaw !== null && sMaxRaw !== undefined ? Number(sMaxRaw) : Infinity;
    return consumption >= sMin && consumption <= sMax;
  });

  if (!fixedSlab) fixedSlab = consumption === 0 ? groupSlabs[0] : groupSlabs[groupSlabs.length - 1];

  const fixedCharge = fixedSlab ? Number(fixedSlab.fixedCharge ?? fixedSlab.fixed_charge ?? fixedSlab.fixed_charge_monthly ?? 0) : 0;
  const energyCharge = parseFloat(totalEnergy.toFixed(2));
  const totalCharge = parseFloat((energyCharge + fixedCharge).toFixed(2));

  let groupName = 'Group A (0–60 kWh)';
  if (selectedGroup.includes('61') || selectedGroup.includes('180') && !selectedGroup.includes('ABOVE')) {
    groupName = '61–180 Group';
  } else if (selectedGroup.includes('ABOVE') || selectedGroup.includes('181') || selectedGroup.includes('C')) {
    groupName = 'Above 180 Group';
  } else {
    groupName = '0–60 Group';
  }

  return {
    consumption,
    tariffGroup: selectedGroup,
    groupDisplayName: groupName,
    energyCharge,
    fixedCharge,
    totalCharge,
    breakdown
  };
}

export default function AdminDashboard({ token, refreshKey }) {
  const [meters, setMeters] = useState([]);
  const [consumers, setConsumers] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [versions, setVersions] = useState([]);
  const [activeVersion, setActiveVersion] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Tariff Edit Modal & Confirmation State
  const [editingTariff, setEditingTariff] = useState(null);
  const [editRate, setEditRate] = useState('');
  const [editFixed, setEditFixed] = useState('');
  const [editEffectiveFrom, setEditEffectiveFrom] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [confirmModal, setConfirmModal] = useState(null); // { type, title, message, onConfirm }

  // Version Management State
  const [isNewVersionOpen, setIsNewVersionOpen] = useState(false);
  const [newVersionName, setNewVersionName] = useState('Domestic Tariff – ' + new Date().toLocaleString('default', { month: 'short', year: 'numeric' }));
  const [newVersionEffectiveFrom, setNewVersionEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);

  // Live Test Consumption State
  const [testKwh, setTestKwh] = useState(80);

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

      const [cRes, mRes, tRes, vRes, aRes] = await Promise.allSettled([
        fetch('http://localhost:5000/api/consumers', { headers }).then(r => r.ok ? r.json() : Promise.reject(r.statusText)),
        fetch('http://localhost:5000/api/meters/all', { headers }).then(r => r.ok ? r.json() : Promise.reject(r.statusText)),
        fetch('http://localhost:5000/api/tariffs', { headers }).then(r => r.ok ? r.json() : Promise.reject(r.statusText)),
        fetch('http://localhost:5000/api/tariffs/versions', { headers }).then(r => r.ok ? r.json() : Promise.reject(r.statusText)),
        fetch('http://localhost:5000/api/audit', { headers }).then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      ]);

      if (cRes.status === 'fulfilled') setConsumers(cRes.value.consumers || []);
      if (mRes.status === 'fulfilled') setMeters(mRes.value.meters || []);
      if (tRes.status === 'fulfilled') {
        setTariffs(tRes.value.tariffs || []);
        if (tRes.value.activeVersion) setActiveVersion(tRes.value.activeVersion);
      }
      if (vRes.status === 'fulfilled') setVersions(vRes.value.versions || []);
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

  // Request Confirmation before Saving Tariff Edit
  const handlePromptSaveTariff = () => {
    if (!editingTariff) return;
    setConfirmModal({
      title: 'Confirm Tariff Slab Update',
      message: `Are you sure you want to update ${editingTariff.groupDisplayName || editingTariff.tariffGroup} (${editingTariff.slabMin}–${editingTariff.slabMax || 'Above'} kWh) rate to LKR ${editRate}/kWh and fixed charge to LKR ${editFixed}/mo?`,
      onConfirm: executeSaveTariff
    });
  };

  // Execute Tariff Save
  const executeSaveTariff = async () => {
    if (!editingTariff) return;
    try {
      const res = await fetch(`http://localhost:5000/api/tariffs/${editingTariff.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          energyRate: parseFloat(editRate),
          fixedCharge: parseFloat(editFixed),
          effectiveFrom: editEffectiveFrom,
          active: editActive
        })
      });

      if (res.ok) {
        setEditingTariff(null);
        setConfirmModal(null);
        await fetchAdminData();
      }
    } catch (err) {
      console.error('Save tariff error:', err);
    }
  };

  // Create New Tariff Version
  const handleCreateVersion = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:5000/api/tariffs/versions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          versionName: newVersionName,
          effectiveFrom: newVersionEffectiveFrom
        })
      });

      if (res.ok) {
        setIsNewVersionOpen(false);
        await fetchAdminData();
      }
    } catch (err) {
      console.error('Create version error:', err);
    }
  };

  // Request Confirmation before Activating Tariff Version
  const handlePromptActivateVersion = (ver) => {
    setConfirmModal({
      title: `Activate Tariff Version '${ver.version_name}'`,
      message: `Activating '${ver.version_name}' will set it as the live active tariff schedule for all new customer billing. Historical bills will remain unaffected. Proceed?`,
      onConfirm: () => executeActivateVersion(ver.id)
    });
  };

  // Execute Version Activation
  const executeActivateVersion = async (verId) => {
    try {
      const res = await fetch(`http://localhost:5000/api/tariffs/versions/${verId}/activate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        setConfirmModal(null);
        await fetchAdminData();
      }
    } catch (err) {
      console.error('Activate version error:', err);
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

  // Group tariffs by consumption group for UI cards
  const tariffGroupsMap = {
    'DOMESTIC_0_60': {
      name: 'Consumption Group A — Monthly consumption 0–60 kWh',
      subtitle: 'Alternative tariff structure for low-consumption consumers',
      badge: 'GROUP A',
      slabs: tariffs.filter(t => (t.tariffGroup || t.tariff_group) === 'DOMESTIC_0_60')
    },
    'DOMESTIC_61_180': {
      name: 'Consumption Group B — Monthly consumption 61–180 kWh',
      subtitle: 'Alternative tariff structure applied once monthly consumption exceeds 60 kWh',
      badge: 'GROUP B',
      slabs: tariffs.filter(t => (t.tariffGroup || t.tariff_group) === 'DOMESTIC_61_180')
    },
    'DOMESTIC_ABOVE_180': {
      name: 'Consumption Group C — Monthly consumption above 180 kWh',
      subtitle: 'Alternative tariff structure applied once monthly consumption exceeds 180 kWh',
      badge: 'GROUP C',
      slabs: tariffs.filter(t => (t.tariffGroup || t.tariff_group) === 'DOMESTIC_ABOVE_180')
    }
  };

  // Live calculated preview for testKwh
  const testCalculation = calculateClientTariff(testKwh, tariffs);

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
                <th style={{ padding: '10px' }}>Present Month kWh</th>
                <th style={{ padding: '10px' }}>Wallet Balance</th>
                <th style={{ padding: '10px' }}>Relay Status</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {consumers.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>No consumer accounts found.</td>
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
                    <td style={{ padding: '12px 10px' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', fontSize: '12px', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>
                        {(c.present_month_kwh || 0).toFixed(2)} kWh
                      </span>
                    </td>
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

      {/* SRI LANKAN DOMESTIC TARIFF CONFIGURATOR */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Header & Versioning Status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Sliders size={22} color="#3b82f6" />
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#f8fafc' }}>Sri Lankan Domestic Electricity Tariff Configurator</h3>
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              Configurable group-based billing structure according to total monthly electricity consumption.
            </p>
          </div>

          {/* Active Version Info Badge & Version Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: '10px', padding: '8px 14px', fontSize: '12px' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700' }}>ACTIVE TARIFF VERSION</div>
              <div style={{ fontWeight: '800', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle size={14} color="#34d399" />
                {activeVersion ? activeVersion.version_name : 'Domestic Tariff – May 2026'}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b' }}>
                Effective From: {activeVersion ? new Date(activeVersion.effective_from).toLocaleDateString() : '2026-05-11'} | Status: ACTIVE
              </div>
            </div>

            <button
              onClick={() => setIsNewVersionOpen(true)}
              className="btn-secondary"
              style={{ padding: '8px 12px', fontSize: '12px' }}
            >
              <Layers size={14} /> New Tariff Version
            </button>
          </div>
        </div>

        {/* Grouped Tariff Tables */}
        {Object.entries(tariffGroupsMap).map(([groupKey, groupMeta]) => (
          <div key={groupKey} style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '16px' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: groupKey === 'DOMESTIC_0_60' ? 'rgba(16, 185, 129, 0.2)' : groupKey === 'DOMESTIC_61_180' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(244, 63, 94, 0.2)', color: groupKey === 'DOMESTIC_0_60' ? '#34d399' : groupKey === 'DOMESTIC_61_180' ? '#60a5fa' : '#fb7185', padding: '4px 8px', borderRadius: '6px', fontWeight: '800', fontSize: '11px' }}>
                    {groupMeta.badge}
                  </span>
                  <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#f8fafc' }}>{groupMeta.name}</h4>
                </div>
                <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{groupMeta.subtitle}</p>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase' }}>
                    <th style={{ padding: '8px 10px' }}>Consumption Group</th>
                    <th style={{ padding: '8px 10px' }}>Billing Block</th>
                    <th style={{ padding: '8px 10px' }}>kWh Range</th>
                    <th style={{ padding: '8px 10px' }}>Energy Rate (LKR/kWh)</th>
                    <th style={{ padding: '8px 10px' }}>Fixed Charge (LKR/month)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {groupMeta.slabs.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>No slabs defined for this group.</td>
                    </tr>
                  ) : (
                    groupMeta.slabs.map((t) => {
                      const slabMin = t.slabMin ?? t.slab_min ?? 0;
                      const slabMax = t.slabMax ?? t.slab_max;
                      const energyRate = Number(t.energyRate ?? t.energy_rate ?? t.rate_per_kwh ?? 0);
                      const fixedCharge = Number(t.fixedCharge ?? t.fixed_charge ?? t.fixed_charge_monthly ?? 0);
                      const groupDisplayName = t.groupDisplayName || t.group_display_name || groupMeta.badge;
                      const billingBlock = t.billingBlock || t.billing_block || (groupKey === 'DOMESTIC_0_60' ? 'Low Consumption' : groupKey === 'DOMESTIC_61_180' ? 'Standard' : 'High Consumption');

                      return (
                        <tr key={t.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', color: '#e2e8f0' }}>
                          <td style={{ padding: '10px', fontWeight: '700', color: '#60a5fa' }}>{groupDisplayName}</td>
                          <td style={{ padding: '10px', color: '#cbd5e1' }}>{billingBlock}</td>
                          <td style={{ padding: '10px', fontFamily: 'var(--font-mono)' }}>
                            {slabMax !== null && slabMax !== undefined ? `${slabMin}–${slabMax}` : `>${slabMin > 0 ? slabMin - 1 : 180}`} kWh
                          </td>
                          <td style={{ padding: '10px', fontWeight: '700', color: '#34d399' }}>
                            LKR {energyRate.toFixed(2)}
                          </td>
                          <td style={{ padding: '10px', fontWeight: '600', color: fixedCharge > 0 ? '#f8fafc' : '#64748b' }}>
                            {fixedCharge > 0 ? `LKR ${fixedCharge.toLocaleString()}` : '-'}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right' }}>
                            <button
                              onClick={() => {
                                setEditingTariff({ ...t, groupDisplayName, billingBlock, slabMin, slabMax, energyRate, fixedCharge });
                                setEditRate(energyRate.toString());
                                setEditFixed(fixedCharge.toString());
                                setEditEffectiveFrom(t.effectiveFrom || t.effective_from || new Date().toISOString().split('T')[0]);
                                setEditActive(t.active !== undefined ? Boolean(t.active) : (t.is_active !== undefined ? Boolean(t.is_active) : true));
                              }}
                              className="btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '11px' }}
                            >
                              <Edit2 size={12} /> Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

          </div>
        ))}

        {/* TARIFF TESTING & CALCULATION PREVIEW SECTION (Requirement 8) */}
        <div style={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <Calculator size={20} color="#10b981" />
            <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc' }}>Tariff Calculation Verification & Simulator</h4>
            <span style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '3px 8px', borderRadius: '6px', fontWeight: '700', marginLeft: 'auto' }}>
              Admin Verification Preview
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '13px', color: '#cbd5e1', fontWeight: '600' }}>Test Consumption:</label>
              <input
                type="number"
                value={testKwh}
                onChange={(e) => setTestKwh(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value)))}
                style={{ width: '100px', padding: '8px 12px', borderRadius: '8px', background: '#0f172a', border: '1px solid var(--border-color)', color: '#34d399', fontSize: '16px', fontWeight: '800', outline: 'none' }}
              />
              <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '700' }}>kWh</span>
            </div>

            {/* Quick Test Preset Buttons */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[30, 50, 60, 80, 150, 190].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setTestKwh(preset)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: testKwh === preset ? 'rgba(16, 185, 129, 0.3)' : 'rgba(30, 41, 59, 0.8)',
                    border: '1px solid ' + (testKwh === preset ? '#10b981' : 'var(--border-color)'),
                    color: testKwh === preset ? '#34d399' : '#94a3b8',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  {preset} kWh
                </button>
              ))}
            </div>
          </div>

          {/* Test Calculation Output Box */}
          {testCalculation && (
            <div style={{ background: '#020617', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.1)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
              <div style={{ color: '#60a5fa', fontWeight: '700', marginBottom: '10px', fontFamily: 'sans-serif' }}>
                Applied tariff: <strong style={{ color: '#f8fafc' }}>{testCalculation.groupDisplayName}</strong>
              </div>

              {testCalculation.breakdown.map((b, idx) => (
                <div key={idx} style={{ color: '#cbd5e1', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>{b.units} kWh × LKR {b.rate.toFixed(2)}</span>
                  <span>= LKR {b.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              ))}

              <div style={{ borderTop: '1px dashed #334155', marginTop: '10px', paddingTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                  <span>Energy Charge</span>
                  <span>= LKR {testCalculation.energyCharge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', marginTop: '2px' }}>
                  <span>Fixed Charge</span>
                  <span>= LKR {testCalculation.fixedCharge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #475569', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', color: '#34d399', fontWeight: '800', fontSize: '15px' }}>
                <span>Total Charge</span>
                <span>= LKR {testCalculation.totalCharge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}
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

      {/* EDIT TARIFF SLAB MODAL */}
      {editingTariff && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '100%', maxWidth: '460px', padding: '24px', position: 'relative' }}>
            <button onClick={() => setEditingTariff(null)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
              <X size={18} />
            </button>

            <h4 style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc', marginBottom: '6px' }}>
              Edit Tariff Block: {editingTariff.groupDisplayName} ({editingTariff.slabMin}–{editingTariff.slabMax || 'Above'} kWh)
            </h4>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>
              Modify energy rate, monthly fixed charge, effective date, or active status.
            </p>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Energy Rate (LKR / kWh)</label>
              <input
                type="number"
                step="0.01"
                value={editRate}
                onChange={(e) => setEditRate(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#34d399', fontWeight: '700', outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Fixed Monthly Charge (LKR)</label>
              <input
                type="number"
                step="0.01"
                value={editFixed}
                onChange={(e) => setEditFixed(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Effective From Date</label>
              <input
                type="date"
                value={editEffectiveFrom}
                onChange={(e) => setEditEffectiveFrom(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="editActiveChk"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
              />
              <label htmlFor="editActiveChk" style={{ fontSize: '13px', color: '#f8fafc', cursor: 'pointer' }}>
                Active Tariff Block
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setEditingTariff(null)} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                Cancel
              </button>
              <button onClick={handlePromptSaveTariff} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                <Save size={16} /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE NEW TARIFF VERSION MODAL */}
      {isNewVersionOpen && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '100%', maxWidth: '460px', padding: '24px', position: 'relative' }}>
            <button onClick={() => setIsNewVersionOpen(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
              <X size={18} />
            </button>

            <h4 style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={20} color="#3b82f6" /> Create New Tariff Version
            </h4>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>
              Create a new version snapshot of domestic electricity tariffs without overwriting historical tariffs.
            </p>

            <form onSubmit={handleCreateVersion}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Version Name *</label>
                <input
                  type="text"
                  required
                  value={newVersionName}
                  onChange={(e) => setNewVersionName(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Effective From Date</label>
                <input
                  type="date"
                  required
                  value={newVersionEffectiveFrom}
                  onChange={(e) => setNewVersionEffectiveFrom(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setIsNewVersionOpen(false)} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  <Plus size={16} /> Create Draft Version
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GENERAL CONFIRMATION DIALOG MODAL (Requirement 5) */}
      {confirmModal && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '24px', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <AlertTriangle size={24} color="#3b82f6" />
            </div>

            <h4 style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc', marginBottom: '8px' }}>
              {confirmModal.title}
            </h4>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px', lineHeight: '1.5' }}>
              {confirmModal.message}
            </p>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setConfirmModal(null)} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                Cancel
              </button>
              <button onClick={confirmModal.onConfirm} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                <CheckCircle size={16} /> Confirm & Activate
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
