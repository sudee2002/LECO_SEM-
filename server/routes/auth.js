const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbQuery } = require('../db/database');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await dbQuery.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Get associated meter and wallet info
    const meter = await dbQuery.get('SELECT * FROM meters WHERE user_id = ?', [user.id]);
    const wallet = await dbQuery.get('SELECT * FROM wallets WHERE user_id = ?', [user.id]);

    const tokenPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      accountNumber: user.account_number,
      meterId: meter ? meter.id : null
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

    // Log login in audit_logs
    await dbQuery.run(
      'INSERT INTO audit_logs (user_id, actor_role, action, details) VALUES (?, ?, ?, ?)',
      [user.id, user.role, 'USER_LOGIN', `User ${user.email} logged in successfully.`]
    );

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        accountNumber: user.account_number,
        meter: meter || null,
        wallet: wallet || { current_balance: 0.0 }
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'customer' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const existingUser = await dbQuery.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const accountNumber = 'LEC-' + Math.floor(100000 + Math.random() * 900000);

    const userRes = await dbQuery.run(
      'INSERT INTO users (name, email, password_hash, role, account_number) VALUES (?, ?, ?, ?, ?)',
      [name, email, passwordHash, role, accountNumber]
    );
    const userId = userRes.lastID;

    // Create wallet for user
    const walletRes = await dbQuery.run(
      'INSERT INTO wallets (user_id, current_balance) VALUES (?, ?)',
      [userId, 0.0]
    );

    // Auto assign a smart meter if customer
    let meter = null;
    if (role === 'customer') {
      const meterId = 'MTR-' + Math.floor(2000 + Math.random() * 8000);
      const meterNum = meterId + '-COL';
      await dbQuery.run(
        'INSERT INTO meters (id, user_id, meter_number, location, status, power_state, last_reading_kwh) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [meterId, userId, meterNum, 'Customer Premises', 'ACTIVE', 'CONNECTED', 0.0]
      );
      meter = await dbQuery.get('SELECT * FROM meters WHERE id = ?', [meterId]);
    }

    const tokenPayload = {
      id: userId,
      name,
      email,
      role,
      accountNumber,
      meterId: meter ? meter.id : null
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

    // Log register event
    await dbQuery.run(
      'INSERT INTO audit_logs (user_id, actor_role, action, details) VALUES (?, ?, ?, ?)',
      [userId, role, 'USER_REGISTER', `New user registered: ${email}`]
    );

    return res.status(201).json({
      message: 'Account registered successfully',
      token,
      user: {
        id: userId,
        name,
        email,
        role,
        accountNumber,
        meter,
        wallet: { current_balance: 0.0 }
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await dbQuery.get('SELECT id, name, email, role, account_number, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    const meter = await dbQuery.get('SELECT * FROM meters WHERE user_id = ?', [user.id]);
    const wallet = await dbQuery.get('SELECT * FROM wallets WHERE user_id = ?', [user.id]);

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        accountNumber: user.account_number,
        createdAt: user.created_at,
        meter: meter || null,
        wallet: wallet || { current_balance: 0.0 }
      }
    });
  } catch (err) {
    console.error('Fetch me error:', err);
    return res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
});

module.exports = router;
