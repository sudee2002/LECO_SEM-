const express = require('express');
const { predictRemainingDays } = require('../services/predictionService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/predictions/remaining-days (Protected Customer Endpoint)
router.get('/remaining-days', authenticateToken, async (req, res) => {
  try {
    const result = await predictRemainingDays(req.user.id);
    return res.json(result);
  } catch (err) {
    console.error('Prediction calculation error:', err);
    return res.status(500).json({ error: 'Failed to calculate remaining days estimate.' });
  }
});

module.exports = router;
