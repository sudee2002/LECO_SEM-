const express = require('express');
const { dbQuery } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/wallet/my-wallet (Protected Customer Endpoint)
router.get('/my-wallet', authenticateToken, async (req, res) => {
  try {
    const wallet = await dbQuery.get('SELECT * FROM wallets WHERE user_id = ?', [req.user.id]);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found for user.' });
    }

    const transactions = await dbQuery.all(
      'SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 20',
      [req.user.id]
    );

    return res.json({
      wallet,
      transactions
    });
  } catch (err) {
    console.error('Fetch wallet error:', err);
    return res.status(500).json({ error: 'Failed to fetch wallet information.' });
  }
});

// GET /api/wallet/transactions (Protected Customer Endpoint - Ledger history)
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const transactions = await dbQuery.all(
      'SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 50',
      [req.user.id]
    );

    return res.json({ transactions });
  } catch (err) {
    console.error('Fetch transactions error:', err);
    return res.status(500).json({ error: 'Failed to fetch transactions.' });
  }
});

module.exports = router;
