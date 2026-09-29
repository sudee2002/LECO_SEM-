const express = require('express');
const { createTopUpOrder, processPaymentCallback } = require('../services/paymentService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/payments/create-order (Protected - Customer initiates Top-Up)
router.post('/create-order', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const numAmount = parseFloat(amount);

    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid top-up amount greater than 0.' });
    }

    const order = await createTopUpOrder(req.user.id, numAmount);
    return res.json({
      message: 'Top-up order created',
      order
    });
  } catch (err) {
    console.error('Create order error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create top-up order.' });
  }
});

// POST /api/payments/webhook (Sandbox Payment Gateway Callback / Verified Webhook)
router.post('/webhook', async (req, res) => {
  try {
    const { order_id, gateway_txn_id, status = 'SUCCESS' } = req.body;

    if (!order_id) {
      return res.status(400).json({ error: 'order_id is required.' });
    }

    const result = await processPaymentCallback(order_id, gateway_txn_id, status);
    return res.json(result);
  } catch (err) {
    console.error('Payment webhook error:', err);
    return res.status(500).json({ error: err.message || 'Failed to process gateway callback.' });
  }
});

module.exports = router;
