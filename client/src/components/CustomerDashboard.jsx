import React, { useState, useEffect } from 'react';
import { Wallet, Zap, Calendar, Activity, Send, MessageSquare, AlertTriangle, ArrowUpRight, CheckCircle, RefreshCw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import TopUpModal from './TopUpModal';

// Gradient Arc Wallet Gauge Component
function WalletGauge({ balance }) {
  const normalizedBalance = Math.max(0, balance);
  const maxVal = Math.max(5000, Math.ceil(normalizedBalance / 1000) * 1000);
  const percentage = Math.min(100, Math.max(0, (normalizedBalance / maxVal) * 100));

  // Dynamic hue: 120 (Green) at 100%, 60 (Yellow/Amber) at 50%, 0 (Red) at 0%
  const hue = (percentage / 100) * 120;
  const strokeColor = `hsl(${hue}, 85%, 45%)`;
  const glowColor = `hsl(${hue}, 85%, 55%)`;

  const radius = 75;
  const circumference = Math.PI * radius; // ~235.62
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  let statusText = 'ACTIVE BALANCE';
  if (balance <= 0) {
    statusText = 'EXHAUSTED / CUTOFF';
  } else if (balance < 1000) {
    statusText = 'LOW BALANCE WARNING';
  }

  return (
    <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '8px 0 12px' }}>
      <svg width="220" height="120" viewBox="0 0 200 115" style={{ overflow: 'visible' }}>
        <defs>
          <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Background Track Arc */}
        <path
          d="M 25 100 A 75 75 0 0 1 175 100"
          fill="none"
          stroke="rgba(255, 255, 255, 0.07)"
          strokeWidth="14"
          strokeLinecap="round"
        />

        {/* Foreground Dynamic Gradient Color Arc */}
        <path
          d="M 25 100 A 75 75 0 0 1 175 100"
          fill="none"
          stroke={strokeColor}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            transition: 'stroke-dashoffset 0.8s ease-in-out, stroke 0.5s ease',
            filter: `drop-shadow(0 0 6px ${glowColor})`
          }}
        />

        {/* Scale labels */}
        <text x="18" y="114" fill="#64748b" fontSize="9" fontWeight="600" textAnchor="middle">LKR 0</text>
        <text x="182" y="114" fill="#64748b" fontSize="9" fontWeight="600" textAnchor="middle">LKR {maxVal.toLocaleString()}</text>
      </svg>

      {/* Center Text Overlay */}
      <div style={{ position: 'absolute', top: '48px', textAlign: 'center', width: '100%' }}>
        <div style={{ fontSize: '10px', fontWeight: '800', color: strokeColor, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {statusText}
        </div>
        <div style={{ fontSize: '24px', fontWeight: '800', color: '#f8fafc', letterSpacing: '-0.02em', marginTop: '2px', textShadow: `0 0 12px ${glowColor}55` }}>
          LKR {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
    </div>
  );
}

export default function CustomerDashboard({ currentUser, token, onDataChange, refreshKey }) {
  const [meterData, setMeterData] = useState(null);
  const [walletData, setWalletData] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  // Telemetry Simulator State
  const [simulating, setSimulating] = useState(false);
  const [lastSimResult, setLastSimResult] = useState(null);
  const [customDailyKwh, setCustomDailyKwh] = useState('5.0');
  const [simulatedDayOffset, setSimulatedDayOffset] = useState(0);

  // AI Chat State
  const [chatMessages, setChatMessages] = useState([
    { sender: 'bot', text: `Hello ${currentUser.name}! I am your LECO Smart AI Assistant. Ask me about your balance, remaining days, or power status.` }
  ]);
  const [inputMsg, setInputMsg] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);

      // 1. Fetch meter
      const mRes = await fetch('http://localhost:5000/api/meters/my-meter', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const mData = await mRes.json();
      setMeterData(mData);

      // 2. Fetch wallet
      const wRes = await fetch('http://localhost:5000/api/wallet/my-wallet', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const wData = await wRes.json();
      setWalletData(wData);

      // 3. Fetch predictions
      const pRes = await fetch('http://localhost:5000/api/predictions/remaining-days', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const pData = await pRes.json();
      setPrediction(pData);

    } catch (err) {
      console.error('Fetch customer dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchData();
  }, [token, currentUser, refreshKey]);

  // Get next simulated reading date (advances +1 day / +24h from latest recorded reading date in history)
  const getNextReadingDate = () => {
    let baseTime = Date.now();
    if (meterData?.readings && meterData.readings.length > 0) {
      const timestamps = meterData.readings
        .map(r => new Date(r.created_at).getTime())
        .filter(t => !isNaN(t));
      if (timestamps.length > 0) {
        baseTime = Math.max(...timestamps);
      }
    }
    return new Date(baseTime + 24 * 60 * 60 * 1000);
  };

  // Inject Simulated Telemetry Reading with Day-by-Day Date Advancement
  const handleSendTelemetry = async (additionalKwh) => {
    if (!meterData?.meter || isNaN(additionalKwh) || additionalKwh <= 0) return;
    setSimulating(true);
    setLastSimResult(null);

    const newCumulative = (meterData.meter.last_reading_kwh || 0) + additionalKwh;
    const readingDate = getNextReadingDate();

    try {
      const res = await fetch('http://localhost:5000/api/meters/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meter_id: meterData.meter.id,
          cumulative_kwh: parseFloat(newCumulative.toFixed(2)),
          created_at: readingDate.toISOString()
        })
      });

      const data = await res.json();
      if (res.ok) {
        setLastSimResult({
          ...data.data,
          readingDate: readingDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
        });
        await fetchData();
        if (onDataChange) onDataChange();
      }
    } catch (err) {
      console.error('Telemetry simulation error:', err);
    } finally {
      setSimulating(false);
    }
  };

  // AI Chat Handler
  const handleSendAiMessage = async (msgText) => {
    const query = msgText || inputMsg;
    if (!query || query.trim() === '') return;

    const userMsg = { sender: 'user', text: query };
    setChatMessages((prev) => [...prev, userMsg]);
    if (!msgText) setInputMsg('');
    setAiLoading(true);

    try {
      const res = await fetch('http://localhost:5000/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: query })
      });

      const data = await res.json();
      if (res.ok) {
        setChatMessages((prev) => [...prev, { sender: 'bot', text: data.reply, toolUsed: data.toolUsed }]);
      }
    } catch (err) {
      setChatMessages((prev) => [...prev, { sender: 'bot', text: 'Failed to connect to AI assistant service.' }]);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading && !meterData) {
    return <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Loading customer dashboard...</div>;
  }

  const meter = meterData?.meter;
  const wallet = walletData?.wallet;
  const isConnected = meter?.power_state === 'CONNECTED';
  const balance = wallet?.current_balance || 0.0;

  // Telemetry Readings formatted with Day of Week, Date, Time, Daily Incremental kWh & Monthly Cycle kWh (resets 1st of month)
  let currentMonthKey = null;
  let runningCycleKwh = 0.0;

  const readingsFormatted = (meterData?.readings || []).map((r) => {
    const d = new Date(r.created_at);
    const monthKey = `${d.getFullYear()}-${d.getMonth() + 1}`;

    if (monthKey !== currentMonthKey) {
      currentMonthKey = monthKey;
      runningCycleKwh = 0.0;
    }

    runningCycleKwh = parseFloat((runningCycleKwh + (r.incremental_kwh || 0)).toFixed(3));

    const dayName = d.toLocaleDateString([], { weekday: 'short' });
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const shortDateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return {
      id: r.id,
      dayName,
      dateStr,
      shortDateStr,
      timeStr,
      fullLabel: `${dayName}, ${dateStr} ${timeStr}`,
      shortLabel: `${dayName}, ${shortDateStr}`,
      dailyKwh: r.incremental_kwh || 0,
      kwh: r.cumulative_kwh,
      cycleKwh: runningCycleKwh,
      charge: r.cost_charged
    };
  });

  const presentMonthKwh = meterData?.present_month_kwh !== undefined 
    ? meterData.present_month_kwh 
    : (readingsFormatted.length > 0 ? readingsFormatted[readingsFormatted.length - 1].cycleKwh : 0.0);

  const nextSimDateStr = getNextReadingDate().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Banner Warning if Cutoff */}
      {!isConnected && (
        <div className="glass-panel" style={{ background: 'rgba(244, 63, 94, 0.15)', borderColor: 'rgba(244, 63, 94, 0.4)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertTriangle size={24} color="#f43f5e" />
            <div>
              <div style={{ fontWeight: '700', color: '#fb7185', fontSize: '15px' }}>ELECTRICITY SUPPLY DISCONNECTED</div>
              <div style={{ fontSize: '13px', color: '#cbd5e1' }}>Wallet balance exhausted (LKR {balance.toFixed(2)}). Top up now to automatically reconnect.</div>
            </div>
          </div>
          <button onClick={() => setIsTopUpOpen(true)} className="btn-primary" style={{ background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)' }}>
            Recharge & Reconnect <Zap size={16} />
          </button>
        </div>
      )}

      {/* Hero Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        
        {/* Wallet Balance Hero Card */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.05em' }}>PREPAID WALLET BALANCE</span>
              <Wallet size={20} color="#10b981" />
            </div>

            <WalletGauge balance={balance} />
          </div>

          <div style={{ marginTop: '12px', display: 'flex', gap: '12px' }}>
            <button onClick={() => setIsTopUpOpen(true)} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
              <Wallet size={18} /> Top Up Wallet
            </button>
          </div>
        </div>

        {/* Present Month kWh Usage Hero Card */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.05em' }}>PRESENT MONTH kWh USAGE</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  fontSize: '10px',
                  fontWeight: '800',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: presentMonthKwh <= 60 ? 'rgba(16, 185, 129, 0.2)' : (presentMonthKwh <= 180 ? 'rgba(56, 189, 248, 0.2)' : 'rgba(244, 63, 94, 0.2)'),
                  color: presentMonthKwh <= 60 ? '#34d399' : (presentMonthKwh <= 180 ? '#38bdf8' : '#fb7185')
                }}>
                  {presentMonthKwh <= 60 ? 'GROUP A' : (presentMonthKwh <= 180 ? 'GROUP B' : 'GROUP C')}
                </span>
                <Activity size={18} color="#f59e0b" />
              </div>
            </div>

            <div style={{ fontSize: '36px', fontWeight: '800', color: '#fbbf24', letterSpacing: '-0.03em', marginTop: '6px' }}>
              {presentMonthKwh.toFixed(2)} <span style={{ fontSize: '18px', fontWeight: '600', color: '#cbd5e1' }}>kWh</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '11px',
                  background: presentMonthKwh <= 60 ? 'rgba(16, 185, 129, 0.15)' : (presentMonthKwh <= 180 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(244, 63, 94, 0.15)'),
                  color: presentMonthKwh <= 60 ? '#34d399' : (presentMonthKwh <= 180 ? '#38bdf8' : '#fb7185'),
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontWeight: '800'
                }}>
                  {presentMonthKwh <= 60 ? 'Group A (Low Tier)' : (presentMonthKwh <= 180 ? 'Group B (Standard Tier)' : 'Group C (High Tier)')}
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600' }}>
                  Billing Range: <strong style={{ color: '#f8fafc' }}>{presentMonthKwh <= 60 ? '0–60 kWh' : (presentMonthKwh <= 180 ? '61–180 kWh' : '>180 kWh')}</strong>
                </span>
              </div>
            </div>

            {/* Consumption Progress Bar */}
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b', marginBottom: '4px', fontWeight: '600' }}>
                <span>0 kWh</span>
                <span>Active Range: {presentMonthKwh <= 60 ? '0–60 kWh' : (presentMonthKwh <= 180 ? '61–180 kWh' : '>180 kWh')}</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, (presentMonthKwh / (presentMonthKwh <= 60 ? 60 : (presentMonthKwh <= 180 ? 180 : 300))) * 100)}%`,
                  height: '100%',
                  background: presentMonthKwh <= 60 ? 'linear-gradient(90deg, #10b981 0%, #f59e0b 100%)' : (presentMonthKwh <= 180 ? 'linear-gradient(90deg, #38bdf8 0%, #f59e0b 100%)' : 'linear-gradient(90deg, #f59e0b 0%, #f43f5e 100%)'),
                  borderRadius: '3px',
                  transition: 'width 0.5s ease-in-out'
                }}></div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '12px', color: '#94a3b8', borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Group: <strong style={{ color: presentMonthKwh <= 60 ? '#34d399' : (presentMonthKwh <= 180 ? '#38bdf8' : '#fb7185') }}>{presentMonthKwh <= 60 ? 'Group A' : (presentMonthKwh <= 180 ? 'Group B' : 'Group C')}</strong></span>
            <span>Billing Cycle: <strong style={{ color: '#f8fafc' }}>Resets 1st</strong></span>
          </div>
        </div>

        {/* Meter & Power Relay Status */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.05em' }}>SMART METER RELAY STATE</span>
              <Zap size={20} color={isConnected ? '#10b981' : '#f43f5e'} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '8px 0' }}>
              <span className={isConnected ? 'badge-connected' : 'badge-disconnected'} style={{ padding: '8px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isConnected ? '#34d399' : '#f43f5e' }}></span>
                {isConnected ? 'POWER CONNECTED' : 'DISCONNECTED (CUTOFF)'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
              Meter ID: <strong style={{ color: '#cbd5e1' }}>{meter?.id}</strong> ({meter?.meter_number})
            </div>
          </div>

          <div style={{ fontSize: '12px', color: '#94a3b8', borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '12px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <span>Present Month: <strong style={{ color: '#fbbf24' }}>{presentMonthKwh.toFixed(2)} kWh</strong></span>
            <span>Cumulative: <strong style={{ color: '#34d399' }}>{meter?.last_reading_kwh || 0} kWh</strong></span>
          </div>
        </div>

        {/* Days Remaining Predictive Widget */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.05em' }}>ESTIMATED DAYS REMAINING</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  fontSize: '10px',
                  fontWeight: '800',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: (prediction?.predictionConfidence === 'HIGH' ? 'rgba(16, 185, 129, 0.2)' : prediction?.predictionConfidence === 'MEDIUM' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(245, 158, 11, 0.2)'),
                  color: (prediction?.predictionConfidence === 'HIGH' ? '#34d399' : prediction?.predictionConfidence === 'MEDIUM' ? '#38bdf8' : '#fbbf24')
                }}>
                  {prediction?.predictionConfidence || 'MEDIUM'} CONFIDENCE
                </span>
                <Calendar size={18} color="#06b6d4" />
              </div>
            </div>

            <div style={{ fontSize: '36px', fontWeight: '800', color: '#06b6d4', letterSpacing: '-0.03em', marginTop: '4px' }}>
              ~{prediction?.estimatedDaysRemaining !== undefined ? prediction.estimatedDaysRemaining : 0} Days
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
              <span style={{ fontSize: '11px', background: 'rgba(6, 182, 212, 0.1)', color: '#38bdf8', padding: '3px 8px', borderRadius: '4px', fontWeight: '700' }}>
                Estimated range: {prediction?.estimatedMinDays || 0}–{prediction?.estimatedMaxDays || 0} days
              </span>
            </div>

            <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px', lineHeight: '1.4' }} title="This estimate uses your recent electricity usage, current wallet balance, billing-cycle consumption, and applicable domestic tariff.">
              {prediction?.predictionText || 'Based on your recent electricity usage.'}
            </p>
          </div>

          <div style={{ fontSize: '12px', color: '#94a3b8', borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Avg Usage: <strong style={{ color: '#f8fafc' }}>{(prediction?.averageDailyUsageKwh || prediction?.dailyAverageKwh || 4.0).toFixed(2)} kWh/day</strong></span>
            <span>Tomorrow: <strong style={{ color: '#34d399' }}>{(prediction?.predictedTomorrowKwh || 4.0).toFixed(2)} kWh</strong></span>
          </div>
        </div>

      </div>

      {/* Grid: Telemetry Simulator + Recharts Area Chart + AI Assistant */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        
        {/* Live Smart Meter Telemetry Simulator Card */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Activity size={20} color="#10b981" />
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc' }}>Smart Meter Telemetry Simulator</h3>
            </div>
            <span style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', padding: '4px 8px', borderRadius: '6px', fontWeight: '600' }}>Day-by-Day Ingestion</span>
          </div>

          <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '14px' }}>
            Type daily kWh consumption below. Each entry automatically updates your meter history, daily charges, and wallet balance day by day:
          </p>

          {/* Editable Custom Consumption Input Box */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
              Daily Consumption Input:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="Type consumption e.g. 5.0"
                  value={customDailyKwh}
                  onChange={(e) => setCustomDailyKwh(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 75px 12px 14px',
                    borderRadius: '10px',
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid var(--border-color)',
                    color: '#34d399',
                    fontSize: '15px',
                    fontWeight: '800',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <span style={{ position: 'absolute', right: '14px', fontSize: '12px', color: '#64748b', fontWeight: '700', pointerEvents: 'none' }}>
                  kWh / day
                </span>
              </div>

              <button
                onClick={() => handleSendTelemetry(parseFloat(customDailyKwh))}
                disabled={simulating || !customDailyKwh || parseFloat(customDailyKwh) <= 0}
                className="btn-primary"
                style={{
                  width: '100%',
                  justify: 'center',
                  padding: '12px 16px',
                  fontSize: '13px',
                  fontWeight: '700',
                  boxSizing: 'border-box'
                }}
              >
                <Zap size={16} /> + Add Day Reading ({(parseFloat(customDailyKwh) || 0).toFixed(1)} kWh)
              </button>
            </div>
          </div>

          {/* Quick Preset Consumption Chips */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Quick Presets:</span>
            {[2.0, 4.0, 6.0, 10.0].map((preset) => (
              <button
                key={preset}
                onClick={() => setCustomDailyKwh(preset.toString())}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: parseFloat(customDailyKwh) === preset ? 'rgba(16, 185, 129, 0.25)' : 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid ' + (parseFloat(customDailyKwh) === preset ? '#10b981' : 'var(--border-color)'),
                  color: parseFloat(customDailyKwh) === preset ? '#34d399' : '#94a3b8',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {preset.toFixed(1)} kWh/day
              </button>
            ))}
          </div>

          <div style={{ fontSize: '11px', color: '#60a5fa', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📅 Next Reading Date: <strong style={{ color: '#38bdf8' }}>{nextSimDateStr}</strong></span>
          </div>

          {lastSimResult && (
            <div style={{ background: 'rgba(15, 23, 42, 0.9)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '12px' }}>
              <div style={{ fontWeight: '700', color: '#34d399', marginBottom: '6px' }}>⚡ Day Reading Ingested ({lastSimResult.readingDate})</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                <span>Daily Consumption Added:</span> <strong>+{lastSimResult.incrementalKwh} kWh</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                <span>New Cumulative Total:</span> <strong>{lastSimResult.cumulativeKwh} kWh</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                <span>Tariff Charge Deducted:</span> <strong style={{ color: '#f43f5e' }}>-LKR {lastSimResult.costCharged.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', marginTop: '4px' }}>
                <span>Wallet Balance:</span> <strong>LKR {lastSimResult.balanceAfter.toFixed(2)}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Historical Telemetry Consumption Chart (Recharts) */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Activity size={20} color="#06b6d4" />
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc' }}>Telemetry Reading History Chart</h3>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', padding: '3px 8px', borderRadius: '6px', fontWeight: '700' }}>
                Present Month: {presentMonthKwh.toFixed(2)} kWh
              </span>
              <span style={{ fontSize: '11px', background: 'rgba(6, 182, 212, 0.15)', color: '#38bdf8', padding: '3px 8px', borderRadius: '6px', fontWeight: '600' }}>
                Monthly Cycle (Resets 1st)
              </span>
            </div>
          </div>

          <div style={{ height: '230px', width: '100%' }}>
            {readingsFormatted.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={readingsFormatted}>
                  <defs>
                    <linearGradient id="colorKwh" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="shortLabel" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', fontSize: '12px' }}
                    labelFormatter={(label, items) => items[0]?.payload?.fullLabel || label}
                    formatter={(value) => [`${Number(value).toFixed(2)} kWh`, 'Monthly Cycle kWh']}
                  />
                  <Area type="monotone" dataKey="cycleKwh" name="Monthly Cycle kWh" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorKwh)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', fontSize: '13px' }}>
                No telemetry readings recorded yet.
              </div>
            )}
          </div>
        </div>

        {/* AI Support Assistant Slot */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '380px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <MessageSquare size={20} color="#06b6d4" />
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc' }}>Smart AI Support Assistant</h3>
            <span style={{ fontSize: '10px', background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4', padding: '3px 8px', borderRadius: '6px', fontWeight: '600', marginLeft: 'auto' }}>Read-Only Tools</span>
          </div>

          {/* Chat Messages */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '6px', marginBottom: '14px' }}>
            {chatMessages.map((m, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: m.sender === 'user' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(30, 41, 59, 0.9)',
                  color: '#ffffff',
                  fontSize: '13px',
                  lineHeight: '1.4'
                }}
              >
                {m.text}
                {m.toolUsed && (
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px', fontStyle: 'italic' }}>
                    Tool: {m.toolUsed}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Quick Prompt Chips */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '8px' }}>
            {['Present month kWh?', 'Current Balance?', 'Days remaining?', 'Power status?'].map((chip) => (
              <button
                key={chip}
                onClick={() => handleSendAiMessage(chip)}
                style={{ padding: '4px 10px', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#94a3b8', fontSize: '11px', whiteSpace: 'nowrap', cursor: 'pointer' }}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Ask AI assistant..."
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendAiMessage()}
              style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#ffffff', fontSize: '13px', outline: 'none' }}
            />
            <button onClick={() => handleSendAiMessage()} disabled={aiLoading} className="btn-primary" style={{ padding: '10px 14px' }}>
              <Send size={16} />
            </button>
          </div>
        </div>

      </div>

      {/* Telemetry Reading History Detailed Day-by-Day Table */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc' }}>Telemetry Reading History (Day-by-Day)</h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              Detailed day-by-day smart meter ingestion history showing day of week, timestamp, daily usage (kWh/day), cumulative total, and daily tariff charges:
            </p>
          </div>
          <span style={{ fontSize: '11px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '4px 10px', borderRadius: '8px', fontWeight: '700' }}>
            {readingsFormatted.length} Daily Readings
          </span>
        </div>

        <div style={{ maxHeight: '340px', overflowY: 'auto', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#0f172a', zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: '#94a3b8' }}>
                <th style={{ padding: '10px', background: '#0f172a' }}>Day & Date</th>
                <th style={{ padding: '10px', background: '#0f172a' }}>Time</th>
                <th style={{ padding: '10px', background: '#0f172a' }}>Daily Usage (kWh/day)</th>
                <th style={{ padding: '10px', background: '#0f172a' }}>Cumulative Total (kWh)</th>
                <th style={{ padding: '10px', background: '#0f172a' }}>Daily Charge (LKR)</th>
                <th style={{ padding: '10px', background: '#0f172a' }}>Ingestion Status</th>
              </tr>
            </thead>
            <tbody>
              {readingsFormatted.slice().reverse().map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', color: '#e2e8f0' }}>
                  <td style={{ padding: '12px 10px', fontWeight: '700', color: '#38bdf8' }}>{r.dayName}, {r.dateStr}</td>
                  <td style={{ padding: '12px 10px', color: '#94a3b8' }}>{r.timeStr}</td>
                  <td style={{ padding: '12px 10px', fontWeight: '700', color: '#34d399' }}>+{r.dailyKwh.toFixed(2)} kWh</td>
                  <td style={{ padding: '12px 10px', fontWeight: '700' }}>{r.kwh.toFixed(2)} kWh</td>
                  <td style={{ padding: '12px 10px', fontWeight: '700', color: r.charge > 0 ? '#fb7185' : '#94a3b8' }}>
                    {r.charge > 0 ? `-LKR ${r.charge.toFixed(2)}` : 'LKR 0.00'}
                  </td>
                  <td style={{ padding: '12px 10px' }}>
                    <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontSize: '11px', fontWeight: '700' }}>
                      SUCCESS
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Wallet Ledger History Table */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc', marginBottom: '16px' }}>Prepaid Wallet Transaction Ledger</h3>

        <div style={{ maxHeight: '340px', overflowY: 'auto', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#0f172a', zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: '#94a3b8' }}>
                <th style={{ padding: '10px', background: '#0f172a' }}>Date</th>
                <th style={{ padding: '10px', background: '#0f172a' }}>Type</th>
                <th style={{ padding: '10px', background: '#0f172a' }}>Reference</th>
                <th style={{ padding: '10px', background: '#0f172a' }}>Balance Before</th>
                <th style={{ padding: '10px', background: '#0f172a' }}>Amount</th>
                <th style={{ padding: '10px', background: '#0f172a' }}>Balance After</th>
              </tr>
            </thead>
            <tbody>
              {(walletData?.transactions || []).map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', color: '#e2e8f0' }}>
                  <td style={{ padding: '12px 10px', color: '#94a3b8' }}>{new Date(t.created_at).toLocaleString()}</td>
                  <td style={{ padding: '12px 10px' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '700',
                      background: t.type === 'TOPUP' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                      color: t.type === 'TOPUP' ? '#34d399' : '#fb7185'
                    }}>
                      {t.type}
                    </span>
                  </td>
                  <td style={{ padding: '12px 10px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{t.reference}</td>
                  <td style={{ padding: '12px 10px' }}>LKR {t.balance_before.toFixed(2)}</td>
                  <td style={{ padding: '12px 10px', fontWeight: '700', color: t.amount > 0 ? '#34d399' : '#fb7185' }}>
                    {t.amount > 0 ? `+LKR ${t.amount.toFixed(2)}` : `-LKR ${Math.abs(t.amount).toFixed(2)}`}
                  </td>
                  <td style={{ padding: '12px 10px', fontWeight: '700' }}>LKR {t.balance_after.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Official Sri Lankan Domestic Electricity Tariff Schedule (Group A, B & C) */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#f8fafc' }}>
              Sri Lankan Domestic Electricity Tariff Schedule
            </h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              Official LECO domestic block tariff groups (Group A, B, C), billing consumption ranges, unit rates (LKR/kWh), and fixed monthly charges.
            </p>
          </div>
          <span style={{ fontSize: '11px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '5px 12px', borderRadius: '8px', fontWeight: '700' }}>
            Active Schedule: Domestic Tariff 2026
          </span>
        </div>

        {/* 3 Tariff Group Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          
          {/* GROUP A CARD */}
          <div style={{
            background: presentMonthKwh <= 60 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(15, 23, 42, 0.6)',
            border: presentMonthKwh <= 60 ? '2px solid #10b981' : '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '20px',
            position: 'relative'
          }}>
            {presentMonthKwh <= 60 && (
              <span style={{ position: 'absolute', top: '-12px', right: '16px', background: '#10b981', color: '#0f172a', fontSize: '10px', fontWeight: '800', padding: '3px 10px', borderRadius: '12px', letterSpacing: '0.05em' }}>
                ✓ YOUR ACTIVE TARIFF GROUP
              </span>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '800', color: '#34d399' }}>GROUP A</span>
              <span style={{ fontSize: '12px', fontWeight: '700', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '3px 8px', borderRadius: '6px' }}>
                0 – 60 kWh / mo
              </span>
            </div>
            <h4 style={{ fontSize: '15px', fontWeight: '700', color: '#f8fafc', marginBottom: '4px' }}>Low Consumption Tier</h4>
            <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '14px' }}>Applied for monthly household energy usage up to 60 kWh.</p>

            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '6px 0' }}>Block Range</th>
                  <th style={{ padding: '6px 0' }}>Energy Rate</th>
                  <th style={{ padding: '6px 0' }}>Fixed Charge</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0' }}>
                  <td style={{ padding: '8px 0', fontWeight: '600' }}>0 – 30 kWh</td>
                  <td style={{ padding: '8px 0', color: '#34d399', fontWeight: '700' }}>LKR 5.00 / kWh</td>
                  <td style={{ padding: '8px 0', color: '#cbd5e1' }}>LKR 80.00 / mo</td>
                </tr>
                <tr style={{ color: '#e2e8f0' }}>
                  <td style={{ padding: '8px 0', fontWeight: '600' }}>31 – 60 kWh</td>
                  <td style={{ padding: '8px 0', color: '#34d399', fontWeight: '700' }}>LKR 9.00 / kWh</td>
                  <td style={{ padding: '8px 0', color: '#cbd5e1' }}>LKR 210.00 / mo</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* GROUP B CARD */}
          <div style={{
            background: (presentMonthKwh > 60 && presentMonthKwh <= 180) ? 'rgba(56, 189, 248, 0.1)' : 'rgba(15, 23, 42, 0.6)',
            border: (presentMonthKwh > 60 && presentMonthKwh <= 180) ? '2px solid #38bdf8' : '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '20px',
            position: 'relative'
          }}>
            {(presentMonthKwh > 60 && presentMonthKwh <= 180) && (
              <span style={{ position: 'absolute', top: '-12px', right: '16px', background: '#38bdf8', color: '#0f172a', fontSize: '10px', fontWeight: '800', padding: '3px 10px', borderRadius: '12px', letterSpacing: '0.05em' }}>
                ✓ YOUR ACTIVE TARIFF GROUP
              </span>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '800', color: '#38bdf8' }}>GROUP B</span>
              <span style={{ fontSize: '12px', fontWeight: '700', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '3px 8px', borderRadius: '6px' }}>
                61 – 180 kWh / mo
              </span>
            </div>
            <h4 style={{ fontSize: '15px', fontWeight: '700', color: '#f8fafc', marginBottom: '4px' }}>Standard Consumption Tier</h4>
            <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '14px' }}>Applied once monthly consumption exceeds 60 kWh up to 180 kWh.</p>

            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '6px 0' }}>Block Range</th>
                  <th style={{ padding: '6px 0' }}>Energy Rate</th>
                  <th style={{ padding: '6px 0' }}>Fixed Charge</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0' }}>
                  <td style={{ padding: '6px 0', fontWeight: '600' }}>0 – 60 kWh</td>
                  <td style={{ padding: '6px 0', color: '#38bdf8', fontWeight: '700' }}>LKR 14.00 / kWh</td>
                  <td style={{ padding: '6px 0', color: '#cbd5e1' }}>LKR 0.00 / mo</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0' }}>
                  <td style={{ padding: '6px 0', fontWeight: '600' }}>61 – 90 kWh</td>
                  <td style={{ padding: '6px 0', color: '#38bdf8', fontWeight: '700' }}>LKR 20.00 / kWh</td>
                  <td style={{ padding: '6px 0', color: '#cbd5e1' }}>LKR 400.00 / mo</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0' }}>
                  <td style={{ padding: '6px 0', fontWeight: '600' }}>91 – 120 kWh</td>
                  <td style={{ padding: '6px 0', color: '#38bdf8', fontWeight: '700' }}>LKR 28.00 / kWh</td>
                  <td style={{ padding: '6px 0', color: '#cbd5e1' }}>LKR 1,000.00 / mo</td>
                </tr>
                <tr style={{ color: '#e2e8f0' }}>
                  <td style={{ padding: '6px 0', fontWeight: '600' }}>121 – 180 kWh</td>
                  <td style={{ padding: '6px 0', color: '#38bdf8', fontWeight: '700' }}>LKR 44.00 / kWh</td>
                  <td style={{ padding: '6px 0', color: '#cbd5e1' }}>LKR 1,500.00 / mo</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* GROUP C CARD */}
          <div style={{
            background: presentMonthKwh > 180 ? 'rgba(244, 63, 94, 0.1)' : 'rgba(15, 23, 42, 0.6)',
            border: presentMonthKwh > 180 ? '2px solid #f43f5e' : '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '20px',
            position: 'relative'
          }}>
            {presentMonthKwh > 180 && (
              <span style={{ position: 'absolute', top: '-12px', right: '16px', background: '#f43f5e', color: '#ffffff', fontSize: '10px', fontWeight: '800', padding: '3px 10px', borderRadius: '12px', letterSpacing: '0.05em' }}>
                ✓ YOUR ACTIVE TARIFF GROUP
              </span>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '800', color: '#fb7185' }}>GROUP C</span>
              <span style={{ fontSize: '12px', fontWeight: '700', background: 'rgba(244, 63, 94, 0.2)', color: '#fb7185', padding: '3px 8px', borderRadius: '6px' }}>
                Above 180 kWh / mo
              </span>
            </div>
            <h4 style={{ fontSize: '15px', fontWeight: '700', color: '#f8fafc', marginBottom: '4px' }}>High Consumption Tier</h4>
            <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '14px' }}>Applied once monthly consumption exceeds 180 kWh.</p>

            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '6px 0' }}>Block Range</th>
                  <th style={{ padding: '6px 0' }}>Energy Rate</th>
                  <th style={{ padding: '6px 0' }}>Fixed Charge</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0' }}>
                  <td style={{ padding: '8px 0', fontWeight: '600' }}>0 – 180 kWh</td>
                  <td style={{ padding: '8px 0', color: '#fb7185', fontWeight: '700' }}>LKR 32.50 / kWh</td>
                  <td style={{ padding: '8px 0', color: '#cbd5e1' }}>LKR 0.00 / mo</td>
                </tr>
                <tr style={{ color: '#e2e8f0' }}>
                  <td style={{ padding: '8px 0', fontWeight: '600' }}>Above 180 kWh</td>
                  <td style={{ padding: '8px 0', color: '#fb7185', fontWeight: '700' }}>LKR 100.00 / kWh</td>
                  <td style={{ padding: '8px 0', color: '#cbd5e1' }}>LKR 2,500.00 / mo</td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>
      </div>

      <TopUpModal
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        token={token}
        onTopUpSuccess={() => fetchData()}
      />

    </div>
  );
}
