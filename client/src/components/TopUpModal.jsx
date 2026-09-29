import React, { useState } from 'react';
import { X, CreditCard, ShieldCheck, CheckCircle2, ArrowRight, Loader2, Zap } from 'lucide-react';

export default function TopUpModal({ isOpen, onClose, token, onTopUpSuccess }) {
  const [amount, setAmount] = useState(1000);
  const [customAmount, setCustomAmount] = useState('');
  const [step, setStep] = useState(1); // 1: Select Amount, 2: Gateway Checkout, 3: Processing Callback, 4: Success
  const [currentOrder, setCurrentOrder] = useState(null);
  const [resultData, setResultData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const effectiveAmount = customAmount ? parseFloat(customAmount) : amount;

  // Step 1: Create Top-up Order
  const handleInitiateOrder = async () => {
    if (!effectiveAmount || effectiveAmount <= 0) {
      setError('Please select or enter a valid top-up amount.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:5000/api/payments/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ amount: effectiveAmount })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create order.');

      setCurrentOrder(data.order);
      setStep(2); // Move to PayHere Sandbox Gateway Screen
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Simulate Payment Completion & Trigger Verified Gateway Webhook
  const handleSimulatePayment = async (status = 'SUCCESS') => {
    if (!currentOrder) return;
    setLoading(true);
    setStep(3); // Processing webhook

    try {
      const res = await fetch('http://localhost:5000/api/payments/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: currentOrder.orderId,
          gateway_txn_id: 'GATEWAY-PAYHERE-SANDBOX-' + Date.now(),
          status
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Webhook callback failed.');

      setResultData(data);
      setStep(4); // Success screen
      if (onTopUpSuccess) onTopUpSuccess(data);
    } catch (err) {
      setError(err.message);
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setCurrentOrder(null);
    setResultData(null);
    setError('');
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '28px', position: 'relative', borderRadius: '20px' }}>
        
        {/* Close Button */}
        <button
          onClick={handleReset}
          style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CreditCard size={22} color="#10b981" />
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc' }}>Wallet Top-Up</h3>
            <p style={{ fontSize: '12px', color: '#94a3b8' }}>PayHere Gateway Sandbox Simulation</p>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fb7185', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {/* Step 1: Select Amount */}
        {step === 1 && (
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', display: 'block', marginBottom: '10px' }}>
              SELECT RECHARGE AMOUNT (LKR)
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '16px' }}>
              {[500, 1000, 2500, 5000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => { setAmount(val); setCustomAmount(''); }}
                  style={{
                    padding: '12px',
                    borderRadius: '12px',
                    border: (amount === val && !customAmount) ? '2px solid #10b981' : '1px solid var(--border-color)',
                    background: (amount === val && !customAmount) ? 'rgba(16, 185, 129, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                    color: '#f8fafc',
                    fontWeight: '700',
                    fontSize: '15px',
                    cursor: 'pointer'
                  }}
                >
                  LKR {val.toLocaleString()}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Or enter custom amount:</label>
              <input
                type="number"
                placeholder="e.g. 1500"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid var(--border-color)',
                  color: '#ffffff',
                  fontSize: '15px',
                  outline: 'none'
                }}
              />
            </div>

            <button
              onClick={handleInitiateOrder}
              disabled={loading}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: '15px' }}
            >
              {loading ? <Loader2 size={18} className="spin" /> : <>Proceed to Sandbox Gateway <ArrowRight size={18} /></>}
            </button>
          </div>
        )}

        {/* Step 2: PayHere Sandbox Interface */}
        {step === 2 && currentOrder && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '20px', borderRadius: '16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Order ID: {currentOrder.orderId}</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#34d399', margin: '8px 0' }}>
                LKR {currentOrder.amount.toLocaleString()}.00
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Merchant: LECO Smart Grid Prepaid Platform</div>
            </div>

            <p style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '16px' }}>
              Simulate customer completing payment on PayHere Hosted Checkout:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => handleSimulatePayment('SUCCESS')}
                disabled={loading}
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
              >
                <ShieldCheck size={18} /> Simulate Successful Payment (Card / PayHere)
              </button>

              <button
                onClick={() => handleSimulatePayment('FAILED')}
                disabled={loading}
                className="btn-secondary"
                style={{ width: '100%', justifyContent: 'center', padding: '10px', color: '#fb7185' }}
              >
                Simulate Payment Failure
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Webhook Processing */}
        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <Loader2 size={36} color="#10b981" className="spin" style={{ margin: '0 auto 16px' }} />
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#f8fafc' }}>Verifying Server-to-Server Callback...</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>Processing PayHere webhook payload & wallet ledger entry...</div>
          </div>
        )}

        {/* Step 4: Success & Power Status */}
        {step === 4 && resultData && (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle2 size={48} color="#34d399" style={{ margin: '0 auto 12px' }} />
            <h4 style={{ fontSize: '20px', fontWeight: '700', color: '#f8fafc' }}>Payment Verified!</h4>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '6px 0 20px' }}>
              LKR {resultData.amount.toLocaleString()}.00 credited to wallet ledger.
            </p>

            <div style={{ background: 'rgba(15, 23, 42, 0.9)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '20px', textAlign: 'left', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#94a3b8' }}>Previous Balance:</span>
                <span style={{ color: '#f8fafc' }}>LKR {resultData.balanceBefore.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#94a3b8' }}>Updated Balance:</span>
                <span style={{ color: '#34d399', fontWeight: '700' }}>LKR {resultData.balanceAfter.toFixed(2)}</span>
              </div>
              {resultData.powerReconnected && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)', color: '#34d399', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={16} /> Power Relay Automatically Reconnected!
                </div>
              )}
            </div>

            <button
              onClick={handleReset}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
            >
              Done & Return to Dashboard
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
