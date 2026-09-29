const express = require('express');
const { dbQuery } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit (Admin Only - List audit logs)
router.get('/', authenticateToken, requireRole('admin', 'utility_operator'), async (req, res) => {
  try {
    const logs = await dbQuery.all(`
      SELECT a.*, u.email as user_email, u.name as user_name
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.id DESC
      LIMIT 100
    `);

    return res.json({ logs });
  } catch (err) {
    console.error('Fetch audit logs error:', err);
    return res.status(500).json({ error: 'Failed to fetch audit logs.' });
  }
});

module.exports = router;
