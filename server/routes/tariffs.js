const express = require('express');
const { dbQuery } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/tariffs (Public / Protected - List domestic tariff schedule)
router.get('/', async (req, res) => {
  try {
    const tariffs = await dbQuery.all(
      'SELECT * FROM tariffs WHERE is_active = 1 ORDER BY min_kwh ASC'
    );
    return res.json({ tariffs });
  } catch (err) {
    console.error('Fetch tariffs error:', err);
    return res.status(500).json({ error: 'Failed to fetch tariff schedule.' });
  }
});

// PUT /api/tariffs/:id (Admin Only - Update tariff rate or fixed charge)
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rate_per_kwh, fixed_charge_monthly } = req.body;

    const tariff = await dbQuery.get('SELECT * FROM tariffs WHERE id = ?', [id]);
    if (!tariff) {
      return res.status(404).json({ error: 'Tariff slab not found.' });
    }

    const newRate = rate_per_kwh !== undefined ? parseFloat(rate_per_kwh) : tariff.rate_per_kwh;
    const newFixed = fixed_charge_monthly !== undefined ? parseFloat(fixed_charge_monthly) : tariff.fixed_charge_monthly;

    await dbQuery.run(
      'UPDATE tariffs SET rate_per_kwh = ?, fixed_charge_monthly = ? WHERE id = ?',
      [newRate, newFixed, id]
    );

    await dbQuery.run(
      'INSERT INTO audit_logs (user_id, actor_role, action, details) VALUES (?, ?, ?, ?)',
      [req.user.id, 'admin', 'TARIFF_UPDATE', `Updated Tariff Slab ${id} (${tariff.min_kwh}-${tariff.max_kwh} kWh) to Rate: LKR ${newRate}/kWh, Fixed: LKR ${newFixed}`]
    );

    const updatedTariff = await dbQuery.get('SELECT * FROM tariffs WHERE id = ?', [id]);
    return res.json({
      message: 'Tariff slab updated successfully',
      tariff: updatedTariff
    });
  } catch (err) {
    console.error('Update tariff error:', err);
    return res.status(500).json({ error: 'Failed to update tariff slab.' });
  }
});

module.exports = router;
