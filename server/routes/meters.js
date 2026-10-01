const express = require('express');
const { dbQuery } = require('../db/database');
const { processMeterReading, calculatePresentMonthKwhFromReadings, calculateElectricityCost } = require('../services/billingService');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/meters/telemetry (Meter Ingestion Simulator Endpoint)
router.post('/telemetry', async (req, res) => {
  try {
    const { meter_id, cumulative_kwh, timestamp, created_at } = req.body;
    const readingTime = timestamp || created_at || null;

    if (!meter_id || cumulative_kwh === undefined) {
      return res.status(400).json({ error: 'meter_id and cumulative_kwh are required.' });
    }

    const numericKwh = parseFloat(cumulative_kwh);
    if (isNaN(numericKwh) || numericKwh < 0) {
      return res.status(400).json({ error: 'cumulative_kwh must be a non-negative number.' });
    }

    const result = await processMeterReading(meter_id, numericKwh, readingTime);
    return res.json({
      message: 'Telemetry processed successfully',
      data: result
    });
  } catch (err) {
    console.error('Telemetry processing error:', err);
    return res.status(500).json({ error: err.message || 'Failed to process telemetry reading.' });
  }
});

// GET /api/meters/my-meter (Protected Customer Endpoint)
router.get('/my-meter', authenticateToken, async (req, res) => {
  try {
    const meter = await dbQuery.get('SELECT * FROM meters WHERE user_id = ?', [req.user.id]);
    if (!meter) {
      return res.status(404).json({ error: 'No meter assigned to this account.' });
    }

    const wallet = await dbQuery.get('SELECT * FROM wallets WHERE user_id = ?', [req.user.id]);
    const walletBalance = wallet ? wallet.current_balance : 0.0;

    const recentReadings = await dbQuery.all(
      'SELECT * FROM meter_readings WHERE meter_id = ? ORDER BY created_at ASC',
      [meter.id]
    );

    const presentMonthKwh = calculatePresentMonthKwhFromReadings(recentReadings);
    const costObj = await calculateElectricityCost(presentMonthKwh);
    const presentMonthCostLkr = costObj ? costObj.totalCharge : 0.0;

    let daysInDeficit = 0;
    let graceDaysRemaining = 14;
    const isInDeficit = walletBalance < presentMonthCostLkr;

    if (isInDeficit && meter.deficit_since) {
      const deficitStart = new Date(meter.deficit_since).getTime();
      const now = Date.now();
      daysInDeficit = Math.max(0, Math.floor((now - deficitStart) / (1000 * 60 * 60 * 24)));
      graceDaysRemaining = Math.max(0, 14 - daysInDeficit);
    }

    return res.json({
      meter: {
        ...meter,
        present_month_kwh: presentMonthKwh,
        present_month_cost_lkr: presentMonthCostLkr,
        is_in_deficit: isInDeficit,
        days_in_deficit: daysInDeficit,
        grace_days_remaining: graceDaysRemaining
      },
      readings: recentReadings,
      present_month_kwh: presentMonthKwh,
      present_month_cost_lkr: presentMonthCostLkr,
      is_in_deficit: isInDeficit,
      days_in_deficit: daysInDeficit,
      grace_days_remaining: graceDaysRemaining
    });
  } catch (err) {
    console.error('Fetch my-meter error:', err);
    return res.status(500).json({ error: 'Failed to fetch meter data.' });
  }
});

// GET /api/meters/all (Admin Only)
router.get('/all', authenticateToken, requireRole('admin', 'utility_operator'), async (req, res) => {
  try {
    const meters = await dbQuery.all(`
      SELECT m.*, u.name as user_name, u.email as user_email, u.account_number, w.current_balance
      FROM meters m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN wallets w ON u.id = w.user_id
      ORDER BY m.id ASC
    `);

    return res.json({ meters });
  } catch (err) {
    console.error('Fetch all meters error:', err);
    return res.status(500).json({ error: 'Failed to fetch meters list.' });
  }
});

// POST /api/meters/:id/relay (Admin Only - Manual Power Relay Control)
router.post('/:id/relay', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason = 'Manual admin override' } = req.body;

    if (!['CONNECT', 'DISCONNECT', 'RECONNECT'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be CONNECT, RECONNECT, or DISCONNECT.' });
    }

    const meter = await dbQuery.get('SELECT * FROM meters WHERE id = ?', [id]);
    if (!meter) {
      return res.status(404).json({ error: 'Meter not found.' });
    }

    const newPowerState = action === 'DISCONNECT' ? 'DISCONNECTED' : 'CONNECTED';
    await dbQuery.run('UPDATE meters SET power_state = ? WHERE id = ?', [newPowerState, id]);

    const cmdId = 'CMD-ADMIN-' + Date.now();
    await dbQuery.run(
      `INSERT INTO power_commands (command_id, meter_id, user_id, action, reason, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [cmdId, id, meter.user_id, action === 'DISCONNECT' ? 'DISCONNECT' : 'RECONNECT', reason, 'EXECUTED']
    );

    await dbQuery.run(
      `INSERT INTO audit_logs (user_id, actor_role, action, details) VALUES (?, ?, ?, ?)`,
      [req.user.id, 'admin', 'MANUAL_RELAY_TOGGLE', `Admin manually toggled meter ${id} power to ${newPowerState}. Reason: ${reason}`]
    );

    return res.json({
      message: `Power relay for meter ${id} updated to ${newPowerState}`,
      meterId: id,
      powerState: newPowerState,
      commandId: cmdId
    });
  } catch (err) {
    console.error('Relay control error:', err);
    return res.status(500).json({ error: 'Failed to toggle relay.' });
  }
});

module.exports = router;
