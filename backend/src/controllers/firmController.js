const { query, getClient } = require('../config/db');
const { validationResult } = require('express-validator');

// GET /api/firms
const listFirms = async (req, res, next) => {
  try {
    let result;
    if (req.user.role === 'tenant_admin') {
      result = await query(
        `SELECT f.*, 
          (SELECT COUNT(*) FROM vendors WHERE firm_id = f.id AND is_active=true) AS vendor_count,
          (SELECT COUNT(*) FROM retailers WHERE firm_id = f.id AND is_active=true) AS retailer_count
         FROM firms f WHERE f.tenant_id = $1 ORDER BY f.created_at`,
        [req.user.tenant_id]
      );
    } else {
      result = await query(
        `SELECT f.*, ufa.role_in_firm, ufa.can_collect
         FROM user_firm_access ufa JOIN firms f ON f.id = ufa.firm_id
         WHERE ufa.user_id = $1 AND ufa.is_active = true AND f.is_active = true ORDER BY f.name`,
        [req.user.id]
      );
    }
    res.json(result.rows);
  } catch (err) { next(err); }
};

// POST /api/firms
const createFirm = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { name, address, phone, gstNumber, panNumber, currency } = req.body;

    // Use a transaction + SELECT FOR UPDATE to prevent race condition on firm limit
    const client = await require('../config/db').getClient();
    try {
      await client.query('BEGIN');

      const tenant = await client.query(
        'SELECT max_firms FROM tenants WHERE id = $1 FOR UPDATE',
        [req.user.tenant_id]
      );
      const firmCount = await client.query(
        'SELECT COUNT(*) FROM firms WHERE tenant_id = $1 AND is_active = true',
        [req.user.tenant_id]
      );

      if (parseInt(firmCount.rows[0].count) >= tenant.rows[0].max_firms) {
        await client.query('ROLLBACK');
        return res.status(402).json({
          error: 'Firm limit reached for your plan. Upgrade to add more firms.',
          code: 'FIRM_LIMIT_REACHED',
          currentCount: parseInt(firmCount.rows[0].count),
          maxAllowed: tenant.rows[0].max_firms,
        });
      }

      const result = await client.query(
        `INSERT INTO firms (tenant_id, name, address, phone, gst_number, pan_number, currency)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.user.tenant_id, name, address || null, phone || null, gstNumber || null, panNumber || null, currency || 'INR']
      );

      await client.query(
        `INSERT INTO user_firm_access (user_id, firm_id, role_in_firm) VALUES ($1, $2, 'firm_admin')`,
        [req.user.id, result.rows[0].id]
      );

      await client.query('COMMIT');
      res.status(201).json(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
};

// PUT /api/firms/:firmId
const updateFirm = async (req, res, next) => {
  try {
    const { name, address, phone, gstNumber, panNumber, currency } = req.body;
    const result = await query(
      `UPDATE firms SET name=$1, address=$2, phone=$3, gst_number=$4, pan_number=$5, currency=$6, updated_at=NOW()
       WHERE id=$7 AND tenant_id=$8 RETURNING *`,
      [name, address || null, phone || null, gstNumber || null, panNumber || null, currency || 'INR', req.params.firmId, req.user.tenant_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Firm not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
};

// GET /api/firms/:firmId/users
const getFirmUsers = async (req, res, next) => {
  try {
    // FIX: verify firm belongs to user's tenant before returning user list
    const firm = await query(
      'SELECT id FROM firms WHERE id=$1 AND tenant_id=$2 AND is_active=true',
      [req.params.firmId, req.user.tenant_id]
    );
    if (!firm.rows.length) return res.status(403).json({ error: 'Firm not accessible' });

    const result = await query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, ufa.role_in_firm, ufa.can_collect, ufa.is_active
       FROM user_firm_access ufa JOIN users u ON u.id = ufa.user_id
       WHERE ufa.firm_id = $1 ORDER BY u.full_name`,
      [req.params.firmId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
};

// POST /api/firms/:firmId/users - add user to firm
const addUserToFirm = async (req, res, next) => {
  try {
    const { userId, roleInFirm, canCollect } = req.body;

    // Ensure user belongs to same tenant
    const user = await query('SELECT id FROM users WHERE id=$1 AND tenant_id=$2', [userId, req.user.tenant_id]);
    if (!user.rows.length) return res.status(404).json({ error: 'User not found in your tenant' });

    const result = await query(
      `INSERT INTO user_firm_access (user_id, firm_id, role_in_firm, can_collect)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, firm_id) DO UPDATE SET role_in_firm=$3, can_collect=$4, is_active=true
       RETURNING *`,
      [userId, req.params.firmId, roleInFirm || 'staff', canCollect || false]
    );
    res.json(result.rows[0]);
  } catch (err) { next(err); }
};

module.exports = { listFirms, createFirm, updateFirm, getFirmUsers, addUserToFirm };
