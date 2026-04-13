const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, getClient } = require('../config/db');
const { validationResult } = require('express-validator');

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = crypto.randomBytes(40).toString('hex');
  return { accessToken, refreshToken };
};

// POST /api/auth/register
const register = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { tenantName, email, password, fullName, phone, planId } = req.body;
    const normalizedEmail  = email.toLowerCase();
    const trimmedName      = fullName.trim();
    const trimmedTenant    = tenantName.trim();

    if (!trimmedName)   { await client.query('ROLLBACK'); return res.status(422).json({ error: 'Full name required' }); }
    if (!trimmedTenant) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'Business name required' }); }

    // Check email not taken (inside transaction to avoid race condition)
    const exists = await client.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (exists.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Resolve plan
    let resolvedPlanId = planId;
    if (!resolvedPlanId) {
      const starter = await client.query("SELECT id FROM subscription_plans WHERE name = 'Starter' LIMIT 1");
      resolvedPlanId = starter.rows[0]?.id;
    }
    const plan = await client.query('SELECT * FROM subscription_plans WHERE id = $1 AND is_active = true', [resolvedPlanId]);
    if (!plan.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // All inserts in one atomic transaction
    const tenantResult = await client.query(
      `INSERT INTO tenants (name, email, phone, plan_id, max_firms, trial_ends_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '14 days') RETURNING id`,
      [trimmedTenant, normalizedEmail, phone || null, resolvedPlanId, plan.rows[0].max_firms]
    );
    const tenantId = tenantResult.rows[0].id;

    const userResult = await client.query(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, phone, role)
       VALUES ($1, $2, $3, $4, $5, 'tenant_admin') RETURNING id`,
      [tenantId, normalizedEmail, passwordHash, trimmedName, phone || null]
    );
    const userId = userResult.rows[0].id;

    await client.query(
      `INSERT INTO tenant_module_subscriptions (tenant_id, module_key, billing_type, price)
       VALUES ($1, 'vendor_ledger', 'free', 0)`,
      [tenantId]
    );

    const firmResult = await client.query(
      `INSERT INTO firms (tenant_id, name) VALUES ($1, $2) RETURNING id`,
      [tenantId, trimmedTenant]
    );

    await client.query(
      `INSERT INTO user_firm_access (user_id, firm_id, role_in_firm) VALUES ($1, $2, 'firm_admin')`,
      [userId, firmResult.rows[0].id]
    );

    const { accessToken, refreshToken } = generateTokens(userId);
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [userId, tokenHash]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Account created',
      accessToken,
      refreshToken,
      user: { id: userId, email: normalizedEmail, fullName: trimmedName, role: 'tenant_admin', tenantId },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { email, password } = req.body;
    const result = await query(
      `SELECT u.*, t.is_active AS tenant_active, t.id AS tenant_id
       FROM users u JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    if (!user.is_active) return res.status(401).json({ error: 'Account deactivated' });
    if (!user.tenant_active) return res.status(403).json({ error: 'Tenant account suspended' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // Get accessible firms
    let firms;
    if (user.role === 'tenant_admin') {
      firms = await query('SELECT id, name FROM firms WHERE tenant_id = $1 AND is_active = true', [user.tenant_id]);
    } else {
      firms = await query(
        `SELECT f.id, f.name, ufa.role_in_firm, ufa.can_collect
         FROM user_firm_access ufa JOIN firms f ON f.id = ufa.firm_id
         WHERE ufa.user_id = $1 AND ufa.is_active = true AND f.is_active = true`,
        [user.id]
      );
    }

    const { accessToken, refreshToken } = generateTokens(user.id);
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [user.id, tokenHash]
    );

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        tenantId: user.tenant_id,
        firms: firms.rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/refresh
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const result = await query(
      `SELECT rt.*, u.is_active, u.tenant_id,
              t.is_active AS tenant_active
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       JOIN tenants t ON t.id = u.tenant_id
       WHERE rt.token_hash = $1 AND rt.revoked = false AND rt.expires_at > NOW()`,
      [tokenHash]
    );
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid or expired refresh token' });

    const row = result.rows[0];
    // FIX: also check user and tenant are still active
    if (!row.is_active) return res.status(401).json({ error: 'Account deactivated' });
    if (!row.tenant_active) return res.status(403).json({ error: 'Tenant account suspended' });

    const tokens = generateTokens(row.user_id);
    const newHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');

    // Rotate refresh token
    await query('UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1', [tokenHash]);
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [row.user_id, newHash]
    );

    res.json(tokens);
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/logout
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await query('UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1', [tokenHash]);
    }
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me
const me = async (req, res, next) => {
  try {
    let firms;
    if (req.user.role === 'tenant_admin') {
      firms = await query(
        'SELECT id, name, gst_number, currency FROM firms WHERE tenant_id = $1 AND is_active = true ORDER BY created_at',
        [req.user.tenant_id]
      );
    } else {
      firms = await query(
        `SELECT f.id, f.name, f.currency, ufa.role_in_firm, ufa.can_collect
         FROM user_firm_access ufa JOIN firms f ON f.id = ufa.firm_id
         WHERE ufa.user_id = $1 AND ufa.is_active = true AND f.is_active = true`,
        [req.user.id]
      );
    }

    const modules = await query(
      `SELECT module_key, billing_type, price, ends_at FROM tenant_module_subscriptions
       WHERE tenant_id = $1 AND is_active = true AND (ends_at IS NULL OR ends_at > NOW())`,
      [req.user.tenant_id]
    );

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        fullName: req.user.full_name,
        role: req.user.role,
        tenantId: req.user.tenant_id,
      },
      firms: firms.rows,
      activeModules: modules.rows.map(m => m.module_key),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, refresh, logout, me };
