const express = require('express');
const bcrypt = require('bcryptjs');
const { dbQuery } = require('../db/database');
const { getPresentMonthKwh } = require('../services/billingService');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/consumers - List all customer accounts (Admin only)
router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const consumers = await dbQuery.all(`
      SELECT 
        u.id, u.name, u.email, u.role, u.account_number, u.created_at,
        m.id as meter_id, m.meter_number, m.location, m.status as meter_status, m.power_state, m.last_reading_kwh,
        w.current_balance
      FROM users u
      LEFT JOIN meters m ON u.id = m.user_id
      LEFT JOIN wallets w ON u.id = w.user_id
      WHERE u.role = 'customer'
      ORDER BY u.id DESC
    `);

    const consumersWithUsage = await Promise.all(consumers.map(async (c) => {
      let present_month_kwh = 0.0;
      if (c.meter_id) {
        present_month_kwh = await getPresentMonthKwh(c.meter_id);
      }
      return {
        ...c,
        present_month_kwh
      };
    }));

    return res.json({ consumers: consumersWithUsage });
  } catch (err) {
    console.error('Fetch consumers error:', err);
    return res.status(500).json({ error: 'Failed to fetch consumers.' });
  }
});

// POST /api/consumers - Add a new consumer account (Admin only)
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, accountNumber, meterId, location, initialBalance } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const existingUser = await dbQuery.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists.' });
    }

    // Generate defaults if not provided
    const finalAccNum = accountNumber?.trim() || ('LEC-' + Math.floor(100000 + Math.random() * 900000));
    const finalMeterId = meterId?.trim() || ('MTR-' + Math.floor(2000 + Math.random() * 8000));
    const finalMeterNum = finalMeterId + '-COL';
    const finalLocation = location?.trim() || 'Customer Premises';
    const finalBalance = parseFloat(initialBalance) >= 0 ? parseFloat(initialBalance) : 0.0;

    const passwordHash = await bcrypt.hash(password, 10);

    // 1. Create user
    const userRes = await dbQuery.run(
      'INSERT INTO users (name, email, password_hash, role, account_number) VALUES (?, ?, ?, ?, ?)',
      [name, email, passwordHash, 'customer', finalAccNum]
    );
    const userId = userRes.lastID;

    // 2. Create wallet
    const walletRes = await dbQuery.run(
      'INSERT INTO wallets (user_id, current_balance) VALUES (?, ?)',
      [userId, finalBalance]
    );
    const walletId = walletRes.lastID;

    if (finalBalance > 0) {
      await dbQuery.run(
        'INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_before, balance_after, reference) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [walletId, userId, 'TOPUP', finalBalance, 0.0, finalBalance, 'ADMIN-INITIAL-TOPUP']
      );
    }

    // 3. Create meter
    const initialPowerState = finalBalance > 0 ? 'CONNECTED' : 'DISCONNECTED';
    await dbQuery.run(
      'INSERT INTO meters (id, user_id, meter_number, location, status, power_state, last_reading_kwh) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [finalMeterId, userId, finalMeterNum, finalLocation, 'ACTIVE', initialPowerState, 0.0]
    );

    // Log audit trail
    await dbQuery.run(
      'INSERT INTO audit_logs (user_id, actor_role, action, details) VALUES (?, ?, ?, ?)',
      [req.user.id, req.user.role, 'ADMIN_CREATE_CONSUMER', `Admin created consumer account '${email}' (Acc: ${finalAccNum}, Meter: ${finalMeterId}, Balance: LKR ${finalBalance})`]
    );

    return res.status(201).json({
      message: 'Consumer created successfully',
      consumer: {
        id: userId,
        name,
        email,
        account_number: finalAccNum,
        meter_id: finalMeterId,
        meter_number: finalMeterNum,
        location: finalLocation,
        current_balance: finalBalance,
        power_state: initialPowerState
      }
    });

  } catch (err) {
    console.error('Create consumer error:', err);
    return res.status(500).json({ error: 'Failed to create consumer account.' });
  }
});

// PUT /api/consumers/:id - Update consumer account (Admin only)
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { name, email, accountNumber, location, currentBalance } = req.body;

    const user = await dbQuery.get('SELECT * FROM users WHERE id = ? AND role = ?', [userId, 'customer']);
    if (!user) {
      return res.status(404).json({ error: 'Consumer account not found.' });
    }

    // Email conflict check
    if (email && email !== user.email) {
      const existing = await dbQuery.get('SELECT * FROM users WHERE email = ? AND id != ?', [email, userId]);
      if (existing) {
        return res.status(400).json({ error: 'Email is already in use by another account.' });
      }
    }

    const updatedName = name?.trim() || user.name;
    const updatedEmail = email?.trim() || user.email;
    const updatedAcc = accountNumber?.trim() || user.account_number;

    await dbQuery.run(
      'UPDATE users SET name = ?, email = ?, account_number = ? WHERE id = ?',
      [updatedName, updatedEmail, updatedAcc, userId]
    );

    // Update meter location if provided
    if (location) {
      await dbQuery.run(
        'UPDATE meters SET location = ? WHERE user_id = ?',
        [location.trim(), userId]
      );
    }

    // Update balance if provided
    if (currentBalance !== undefined && !isNaN(parseFloat(currentBalance))) {
      const newBal = parseFloat(currentBalance);
      await dbQuery.run(
        'UPDATE wallets SET current_balance = ? WHERE user_id = ?',
        [newBal, userId]
      );

      // If balance positive, ensure meter is re-connected if it was cut off
      if (newBal > 0) {
        await dbQuery.run(
          "UPDATE meters SET power_state = 'CONNECTED' WHERE user_id = ?",
          [userId]
        );
      }
    }

    // Audit log
    await dbQuery.run(
      'INSERT INTO audit_logs (user_id, actor_role, action, details) VALUES (?, ?, ?, ?)',
      [req.user.id, req.user.role, 'ADMIN_UPDATE_CONSUMER', `Admin updated consumer details for user ID ${userId} (${updatedEmail})`]
    );

    return res.json({ message: 'Consumer details updated successfully' });

  } catch (err) {
    console.error('Update consumer error:', err);
    return res.status(500).json({ error: 'Failed to update consumer.' });
  }
});

// DELETE /api/consumers/:id - Delete consumer account (Admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    const user = await dbQuery.get('SELECT * FROM users WHERE id = ? AND role = ?', [userId, 'customer']);
    if (!user) {
      return res.status(404).json({ error: 'Consumer account not found.' });
    }

    // Get meter ID for reading cleanup
    const meter = await dbQuery.get('SELECT id FROM meters WHERE user_id = ?', [userId]);

    if (meter) {
      await dbQuery.run('DELETE FROM meter_readings WHERE meter_id = ?', [meter.id]);
      await dbQuery.run('DELETE FROM meters WHERE user_id = ?', [userId]);
    }

    await dbQuery.run('DELETE FROM wallet_transactions WHERE user_id = ?', [userId]);
    await dbQuery.run('DELETE FROM wallets WHERE user_id = ?', [userId]);
    await dbQuery.run('DELETE FROM users WHERE id = ?', [userId]);

    // Audit log
    await dbQuery.run(
      'INSERT INTO audit_logs (user_id, actor_role, action, details) VALUES (?, ?, ?, ?)',
      [req.user.id, req.user.role, 'ADMIN_DELETE_CONSUMER', `Admin deleted consumer account '${user.email}' (ID: ${userId})`]
    );

    return res.json({ message: `Consumer '${user.name}' deleted successfully.` });

  } catch (err) {
    console.error('Delete consumer error:', err);
    return res.status(500).json({ error: 'Failed to delete consumer.' });
  }
});

module.exports = router;
