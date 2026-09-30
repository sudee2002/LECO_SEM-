const express = require('express');
const { dbQuery } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { calculateElectricityCost } = require('../services/billingService');

const router = express.Router();

// Helper to normalize tariff slab object keys
function formatTariffSlab(row) {
  if (!row) return null;
  return {
    id: row.id,
    versionId: row.version_id,
    category: row.category,
    tariffGroup: row.tariff_group,
    tariff_group: row.tariff_group,
    groupDisplayName: row.group_display_name || row.tariff_group,
    group_display_name: row.group_display_name || row.tariff_group,
    billingBlock: row.billing_block || '',
    billing_block: row.billing_block || '',
    groupMinConsumption: row.group_min_consumption,
    group_min_consumption: row.group_min_consumption,
    groupMaxConsumption: row.group_max_consumption,
    group_max_consumption: row.group_max_consumption,
    slabMin: row.slab_min,
    slab_min: row.slab_min,
    slabMax: row.slab_max,
    slab_max: row.slab_max,
    min_kwh: row.slab_min, // Backwards compatibility alias
    max_kwh: row.slab_max !== null ? row.slab_max : 99999, // Backwards compatibility alias
    energyRate: row.energy_rate,
    energy_rate: row.energy_rate,
    rate_per_kwh: row.energy_rate, // Backwards compatibility alias
    fixedCharge: row.fixed_charge,
    fixed_charge: row.fixed_charge,
    fixed_charge_monthly: row.fixed_charge, // Backwards compatibility alias
    effectiveFrom: row.effective_from,
    effective_from: row.effective_from,
    effectiveTo: row.effective_to,
    effective_to: row.effective_to,
    active: Boolean(row.is_active),
    is_active: row.is_active
  };
}

// GET /api/tariffs (Public / Protected - List domestic tariff schedule)
router.get('/', async (req, res) => {
  try {
    const versionId = req.query.versionId;
    let query = 'SELECT * FROM tariffs WHERE is_active = 1 ORDER BY group_min_consumption ASC, slab_min ASC';
    let params = [];

    if (versionId) {
      query = 'SELECT * FROM tariffs WHERE version_id = ? ORDER BY group_min_consumption ASC, slab_min ASC';
      params = [versionId];
    }

    const rows = await dbQuery.all(query, params);
    const tariffs = rows.map(formatTariffSlab);

    const activeVersion = await dbQuery.get('SELECT * FROM tariff_versions WHERE status = "ACTIVE" ORDER BY id DESC LIMIT 1');

    return res.json({ tariffs, activeVersion });
  } catch (err) {
    console.error('Fetch tariffs error:', err);
    return res.status(500).json({ error: 'Failed to fetch tariff schedule.' });
  }
});

// GET /api/tariffs/versions (Admin / Public - List tariff versions)
router.get('/versions', async (req, res) => {
  try {
    const versions = await dbQuery.all('SELECT * FROM tariff_versions ORDER BY id DESC');
    return res.json({ versions });
  } catch (err) {
    console.error('Fetch tariff versions error:', err);
    return res.status(500).json({ error: 'Failed to fetch tariff versions.' });
  }
});

// POST or GET /api/tariffs/calculate (Test/Preview Electricity Bill Calculation)
router.all('/calculate', async (req, res) => {
  try {
    const consumptionKwh = req.method === 'POST' ? req.body.consumption : req.query.consumption;
    const category = (req.method === 'POST' ? req.body.category : req.query.category) || 'DOMESTIC';
    const billingDate = req.method === 'POST' ? req.body.billingDate : req.query.billingDate;

    if (consumptionKwh === undefined || consumptionKwh === null || isNaN(Number(consumptionKwh))) {
      return res.status(400).json({ error: 'Valid consumption kWh value is required.' });
    }

    const calculation = await calculateElectricityCost(Number(consumptionKwh), category, billingDate);
    return res.json({ calculation });
  } catch (err) {
    console.error('Calculate electricity cost error:', err);
    return res.status(500).json({ error: 'Calculation service failed.' });
  }
});

// PUT /api/tariffs/:id (Admin Only - Update single tariff slab)
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { energyRate, rate_per_kwh, fixedCharge, fixed_charge, effectiveFrom, effective_from, active, is_active } = req.body;

    const tariff = await dbQuery.get('SELECT * FROM tariffs WHERE id = ?', [id]);
    if (!tariff) {
      return res.status(404).json({ error: 'Tariff slab not found.' });
    }

    const newRate = energyRate !== undefined ? parseFloat(energyRate) : (rate_per_kwh !== undefined ? parseFloat(rate_per_kwh) : tariff.energy_rate);
    const newFixed = fixedCharge !== undefined ? parseFloat(fixedCharge) : (fixed_charge !== undefined ? parseFloat(fixed_charge) : tariff.fixed_charge);
    const newEffectiveFrom = effectiveFrom || effective_from || tariff.effective_from;
    const newActive = active !== undefined ? (active ? 1 : 0) : (is_active !== undefined ? (is_active ? 1 : 0) : tariff.is_active);

    await dbQuery.run(
      'UPDATE tariffs SET energy_rate = ?, fixed_charge = ?, effective_from = ?, is_active = ? WHERE id = ?',
      [newRate, newFixed, newEffectiveFrom, newActive, id]
    );

    await dbQuery.run(
      'INSERT INTO audit_logs (user_id, actor_role, action, details) VALUES (?, ?, ?, ?)',
      [
        req.user.id,
        'admin',
        'TARIFF_UPDATE',
        `Updated Tariff Slab ${id} (${tariff.tariff_group} ${tariff.slab_min}-${tariff.slab_max} kWh): Rate LKR ${newRate}/kWh, Fixed LKR ${newFixed}, Active: ${newActive}`
      ]
    );

    const updated = await dbQuery.get('SELECT * FROM tariffs WHERE id = ?', [id]);
    return res.json({
      message: 'Tariff slab updated successfully',
      tariff: formatTariffSlab(updated)
    });
  } catch (err) {
    console.error('Update tariff error:', err);
    return res.status(500).json({ error: 'Failed to update tariff slab.' });
  }
});

// POST /api/tariffs/versions (Admin Only - Create a new Tariff Version)
router.post('/versions', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { versionName, effectiveFrom, slabs } = req.body;

    if (!versionName) {
      return res.status(400).json({ error: 'Version name is required.' });
    }

    const effFrom = effectiveFrom || new Date().toISOString().split('T')[0];

    const vRes = await dbQuery.run(
      'INSERT INTO tariff_versions (version_name, category, effective_from, status) VALUES (?, ?, ?, ?)',
      [versionName, 'DOMESTIC', effFrom, 'INACTIVE']
    );
    const newVersionId = vRes.lastID;

    // Use provided slabs or copy existing active slabs
    let slabsToInsert = slabs;
    if (!slabsToInsert || slabsToInsert.length === 0) {
      slabsToInsert = await dbQuery.all('SELECT * FROM tariffs WHERE is_active = 1 ORDER BY id ASC');
    }

    for (const s of slabsToInsert) {
      await dbQuery.run(
        `INSERT INTO tariffs (version_id, category, tariff_group, group_display_name, billing_block, group_min_consumption, group_max_consumption, slab_min, slab_max, energy_rate, fixed_charge, effective_from, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newVersionId,
          'DOMESTIC',
          s.tariff_group || s.tariffGroup,
          s.group_display_name || s.groupDisplayName,
          s.billing_block || s.billingBlock,
          s.group_min_consumption !== undefined ? s.group_min_consumption : s.groupMinConsumption,
          s.group_max_consumption !== undefined ? s.group_max_consumption : s.groupMaxConsumption,
          s.slab_min !== undefined ? s.slab_min : s.slabMin,
          s.slab_max !== undefined ? s.slab_max : s.slabMax,
          s.energy_rate !== undefined ? s.energy_rate : (s.energyRate || s.rate_per_kwh),
          s.fixed_charge !== undefined ? s.fixed_charge : (s.fixedCharge || s.fixed_charge_monthly),
          effFrom,
          0 // Inactive until explicitly activated
        ]
      );
    }

    await dbQuery.run(
      'INSERT INTO audit_logs (user_id, actor_role, action, details) VALUES (?, ?, ?, ?)',
      [req.user.id, 'admin', 'TARIFF_VERSION_CREATE', `Created Tariff Version '${versionName}' (ID ${newVersionId}) effective from ${effFrom}`]
    );

    const version = await dbQuery.get('SELECT * FROM tariff_versions WHERE id = ?', [newVersionId]);
    return res.json({ message: 'Tariff version created successfully.', version });
  } catch (err) {
    console.error('Create tariff version error:', err);
    return res.status(500).json({ error: 'Failed to create tariff version.' });
  }
});

// POST /api/tariffs/versions/:id/activate (Admin Only - Activate a Tariff Version)
router.post('/versions/:id/activate', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const version = await dbQuery.get('SELECT * FROM tariff_versions WHERE id = ?', [id]);

    if (!version) {
      return res.status(404).json({ error: 'Tariff version not found.' });
    }

    const activationTime = new Date().toISOString();

    // 1. Deactivate & archive current active version
    const activeVersion = await dbQuery.get('SELECT * FROM tariff_versions WHERE status = "ACTIVE"');
    if (activeVersion) {
      await dbQuery.run(
        'UPDATE tariff_versions SET status = "INACTIVE", effective_to = ? WHERE id = ?',
        [activationTime, activeVersion.id]
      );
      await dbQuery.run(
        'UPDATE tariffs SET is_active = 0, effective_to = ? WHERE version_id = ?',
        [activationTime, activeVersion.id]
      );
    }

    // 2. Activate requested version
    await dbQuery.run(
      'UPDATE tariff_versions SET status = "ACTIVE", effective_from = ?, effective_to = NULL WHERE id = ?',
      [activationTime, id]
    );
    await dbQuery.run(
      'UPDATE tariffs SET is_active = 1, effective_from = ?, effective_to = NULL WHERE version_id = ?',
      [activationTime, id]
    );

    await dbQuery.run(
      'INSERT INTO audit_logs (user_id, actor_role, action, details) VALUES (?, ?, ?, ?)',
      [req.user.id, 'admin', 'TARIFF_VERSION_ACTIVATE', `Activated Tariff Version '${version.version_name}' (ID ${id})`]
    );

    const updatedVersion = await dbQuery.get('SELECT * FROM tariff_versions WHERE id = ?', [id]);
    const activeSlabs = await dbQuery.all('SELECT * FROM tariffs WHERE version_id = ?', [id]);

    return res.json({
      message: `Tariff version '${version.version_name}' activated successfully.`,
      version: updatedVersion,
      tariffs: activeSlabs.map(formatTariffSlab)
    });
  } catch (err) {
    console.error('Activate tariff version error:', err);
    return res.status(500).json({ error: 'Failed to activate tariff version.' });
  }
});

module.exports = router;
