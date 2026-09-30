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

  // Inject Simulated Telemetry Reading
  const handleSendTelemetry = async (additionalKwh) => {
    if (!meterData?.meter) return;
    setSimulating(true);
    setLastSimResult(null);

    const newCumulative = (meterData.meter.last_reading_kwh || 0) + additionalKwh;

    try {
      const res = await fetch('http://localhost:5000/api/meters/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meter_id: meterData.meter.id,
          cumulative_kwh: parseFloat(newCumulative.toFixed(2))
        })
      });

      const data = await res.json();
      if (res.ok) {
        setLastSimResult(data.data);
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

  // Chart data formatting
  const readingsChartData = (meterData?.readings || [])
    .slice()
    .reverse()
    .map((r) => ({
      time: new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      kwh: r.cumulative_kwh,
      charge: r.cost_charged
    }));

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
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

          <div style={{ fontSize: '12px', color: '#94a3b8', borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '12px' }}>
            Cumulative Reading: <strong style={{ color: '#34d399' }}>{meter?.last_reading_kwh || 0} kWh</strong>
          </div>
        </div>

        {/* Days Remaining Predictive Widget */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.05em' }}>ESTIMATED DAYS REMAINING</span>
              <Calendar size={20} color="#06b6d4" />
            </div>

            <div style={{ fontSize: '36px', fontWeight: '800', color: '#06b6d4', letterSpacing: '-0.03em' }}>
              ~{prediction?.estimatedDaysRemaining || 0} Days
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
              {prediction?.predictionText}
            </p>
          </div>

          <div style={{ fontSize: '12px', color: '#94a3b8', borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '12px' }}>
            Avg Daily Usage: <strong style={{ color: '#f8fafc' }}>{prediction?.dailyAverageKwh || 4.0} kWh/day</strong>
          </div>
        </div>

      </div>

      {/* Grid: Telemetry Simulator + Recharts Area Chart + AI Assistant */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        
        {/* Live Smart Meter Pulse Simulator Card */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Activity size={20} color="#10b981" />
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc' }}>Smart Meter Telemetry Simulator</h3>
            </div>
            <span style={{ fontSize: '11px', background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', padding: '4px 8px', borderRadius: '6px', fontWeight: '600' }}>REST API Trigger</span>
          </div>

          <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
            Inject simulated kWh energy consumption from smart meter to trigger backend tariff billing and wallet deduction:
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
            {[0.5, 1.5, 5.0].map((kwh) => (
              <button
                key={kwh}
                onClick={() => handleSendTelemetry(kwh)}
                disabled={simulating}
                className="btn-secondary"
                style={{ justifyContent: 'center', padding: '12px', fontSize: '13px' }}
              >
                +{kwh} kWh Pulse
              </button>
            ))}
          </div>

          {lastSimResult && (
            <div style={{ background: 'rgba(15, 23, 42, 0.9)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '13px' }}>
              <div style={{ fontWeight: '700', color: '#34d399', marginBottom: '6px' }}>⚡ Telemetry Reading Received</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                <span>Incremental Usage:</span> <strong>+{lastSimResult.incrementalKwh} kWh</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                <span>Tariff Charge Deducted:</span> <strong style={{ color: '#f43f5e' }}>-LKR {lastSimResult.costCharged.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', marginTop: '4px' }}>
                <span>New Wallet Balance:</span> <strong>LKR {lastSimResult.balanceAfter.toFixed(2)}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Historical Telemetry Consumption Chart (Recharts) */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Activity size={20} color="#06b6d4" />
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc' }}>Telemetry Reading History</h3>
            </div>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Cumulative kWh</span>
          </div>

          <div style={{ height: '230px', width: '100%' }}>
            {readingsChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={readingsChartData}>
                  <defs>
                    <linearGradient id="colorKwh" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc' }} />
                  <Area type="monotone" dataKey="kwh" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorKwh)" />
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
            {['Current Balance?', 'Days remaining?', 'Power status?'].map((chip) => (
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

      {/* Wallet Ledger History Table */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc', marginBottom: '16px' }}>Prepaid Wallet Transaction Ledger</h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: '#94a3b8' }}>
                <th style={{ padding: '10px' }}>Date</th>
                <th style={{ padding: '10px' }}>Type</th>
                <th style={{ padding: '10px' }}>Reference</th>
                <th style={{ padding: '10px' }}>Balance Before</th>
                <th style={{ padding: '10px' }}>Amount</th>
                <th style={{ padding: '10px' }}>Balance After</th>
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

      <TopUpModal
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        token={token}
        onTopUpSuccess={() => fetchData()}
      />

    </div>
  );
}
