const express = require('express');
const { dbQuery } = require('../db/database');
const { predictRemainingDays } = require('../services/predictionService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * Read-only AI tool handlers scoped to the authenticated customer
 */
async function executeAITool(toolName, userId) {
  switch (toolName) {
    case 'getCurrentBalance': {
      const wallet = await dbQuery.get('SELECT current_balance FROM wallets WHERE user_id = ?', [userId]);
      return { balance: wallet ? wallet.current_balance : 0.0 };
    }
    case 'getAccountStatus': {
      const meter = await dbQuery.get('SELECT id, power_state, status, last_reading_kwh FROM meters WHERE user_id = ?', [userId]);
      return { meter: meter || null };
    }
    case 'estimateRemainingDays': {
      const pred = await predictRemainingDays(userId);
      return { estimatedDaysRemaining: pred.estimatedDaysRemaining, dailyAverageKwh: pred.dailyAverageKwh, status: pred.status };
    }
    case 'getPaymentHistory': {
      const payments = await dbQuery.all('SELECT payment_id, order_id, amount, status, created_at FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 5', [userId]);
      return { recentPayments: payments };
    }
    default:
      return null;
  }
}

// POST /api/ai/chat (Protected - Smart AI Support Assistant Endpoint)
router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message text is required.' });
    }

    const lowerMsg = message.toLowerCase();
    const userId = req.user.id;

    // Fetch context data using safe read-only tools
    const balanceData = await executeAITool('getCurrentBalance', userId);
    const accountData = await executeAITool('getAccountStatus', userId);
    const predictionData = await executeAITool('estimateRemainingDays', userId);
    const paymentData = await executeAITool('getPaymentHistory', userId);

    let reply = '';
    let toolUsed = 'searchApprovedHelp';

    if (lowerMsg.includes('balance') || lowerMsg.includes('money') || lowerMsg.includes('credit')) {
      toolUsed = 'getCurrentBalance()';
      reply = `Your current prepaid wallet balance is **LKR ${balanceData.balance.toFixed(2)}**. `;
      if (balanceData.balance <= 0) {
        reply += `⚠️ Your balance is currently zero or negative. Power supply is disconnected. Please top up your wallet to reconnect electricity.`;
      } else {
        reply += `Based on your recent usage, your balance is estimated to last approximately **${predictionData.estimatedDaysRemaining} days**.`;
      }
    } else if (lowerMsg.includes('day') || lowerMsg.includes('last') || lowerMsg.includes('estimate') || lowerMsg.includes('expire')) {
      toolUsed = 'estimateRemainingDays()';
      reply = `Based on your recent average daily consumption of **${predictionData.dailyAverageKwh} kWh/day**, your current balance of LKR ${balanceData.balance.toFixed(2)} is estimated to last **${predictionData.estimatedDaysRemaining} days**.`;
    } else if (lowerMsg.includes('power') || lowerMsg.includes('status') || lowerMsg.includes('disconnect') || lowerMsg.includes('cutoff') || lowerMsg.includes('meter')) {
      toolUsed = 'getAccountStatus()';
      const state = accountData.meter ? accountData.meter.power_state : 'UNKNOWN';
      reply = `Your Smart Meter **${accountData.meter ? accountData.meter.id : 'N/A'}** power relay is currently **${state}**. `;
      if (state === 'DISCONNECTED') {
        reply += `The supply was automatically disconnected due to wallet exhaustion. Top up to restore power.`;
      } else {
        reply += `Your electricity supply is active and functioning normally.`;
      }
    } else if (lowerMsg.includes('payment') || lowerMsg.includes('topup') || lowerMsg.includes('recharge') || lowerMsg.includes('receipt')) {
      toolUsed = 'getPaymentHistory()';
      const recent = paymentData.recentPayments;
      if (recent && recent.length > 0) {
        const last = recent[0];
        reply = `Your last top-up order was **${last.order_id}** for **LKR ${last.amount.toFixed(2)}** (Status: **${last.status}**).`;
      } else {
        reply = `You have no recent payment records. You can top up your wallet using the 'Top Up' button on your dashboard.`;
      }
    } else if (lowerMsg.includes('tariff') || lowerMsg.includes('rate') || lowerMsg.includes('cost') || lowerMsg.includes('price')) {
      toolUsed = 'searchApprovedHelp()';
      reply = `LECO/CEB electricity billing uses a tiered domestic block tariff structure:
- 0 to 30 kWh: LKR 8.00/kWh (Fixed LKR 150/mo)
- 31 to 60 kWh: LKR 15.00/kWh (Fixed LKR 300/mo)
- 61 to 90 kWh: LKR 22.00/kWh (Fixed LKR 400/mo)
- 91 to 180 kWh: LKR 35.00/kWh (Fixed LKR 1000/mo)
- >180 kWh: LKR 50.00/kWh (Fixed LKR 1500/mo)`;
    } else {
      toolUsed = 'searchApprovedHelp()';
      reply = `Hello ${req.user.name}! I am your LECO Smart AI Assistant. I can help you check your current wallet balance, estimated days remaining, power connection status, recent payments, or tariff rates. How can I assist you today?`;
    }

    return res.json({
      reply,
      toolUsed,
      securityNote: 'AI Assistant operates strictly in read-only mode using authorized backend tools.',
      context: {
        balance: balanceData.balance,
        powerState: accountData.meter ? accountData.meter.power_state : 'UNKNOWN',
        estimatedDaysRemaining: predictionData.estimatedDaysRemaining
      }
    });
  } catch (err) {
    console.error('AI chat error:', err);
    return res.status(500).json({ error: 'Failed to process AI assistant request.' });
  }
});

module.exports = router;
