const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

// Verify JWT and attach user to request
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await query(
      `SELECT u.id, u.tenant_id, u.email, u.full_name, u.role, u.is_active,
              t.is_active AS tenant_active, t.plan_id
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (!result.rows.length) return res.status(401).json({ error: 'User not found' });
    const user = result.rows[0];
    if (!user.is_active) return res.status(401).json({ error: 'Account deactivated' });
    if (!user.tenant_active) return res.status(403).json({ error: 'Tenant account suspended' });

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Check user has access to requested firm (and firm belongs to their tenant)
const requireFirmAccess = async (req, res, next) => {
  try {
    // FIX: only read firmId from URL params — never from body or query string
    // Body/query firmId can be attacker-controlled on non-mutating routes
    const firmId = req.params.firmId;
    if (!firmId) return res.status(400).json({ error: 'firmId required in URL' });

    // tenant_admin can access all firms in their tenant
    if (req.user.role === 'tenant_admin') {
      const firm = await query(
        'SELECT id FROM firms WHERE id = $1 AND tenant_id = $2 AND is_active = true',
        [firmId, req.user.tenant_id]
      );
      if (!firm.rows.length) return res.status(403).json({ error: 'Firm not accessible' });
      req.firmId = firmId;
      return next();
    }

    // Other roles need explicit user_firm_access
    const access = await query(
      `SELECT ufa.role_in_firm, ufa.can_collect, f.tenant_id
       FROM user_firm_access ufa
       JOIN firms f ON f.id = ufa.firm_id
       WHERE ufa.user_id = $1 AND ufa.firm_id = $2 AND ufa.is_active = true AND f.is_active = true`,
      [req.user.id, firmId]
    );
    if (!access.rows.length) return res.status(403).json({ error: 'No access to this firm' });
    if (access.rows[0].tenant_id !== req.user.tenant_id) {
      return res.status(403).json({ error: 'Cross-tenant access denied' });
    }
    req.firmId = firmId;
    req.firmRole = access.rows[0].role_in_firm;
    req.canCollect = access.rows[0].can_collect;
    next();
  } catch (err) {
    next(err);
  }
};

// Check module subscription
const requireModule = (moduleKey) => async (req, res, next) => {
  try {
    const sub = await query(
      `SELECT id FROM tenant_module_subscriptions
       WHERE tenant_id = $1 AND module_key = $2 AND is_active = true
       AND (ends_at IS NULL OR ends_at > NOW())`,
      [req.user.tenant_id, moduleKey]
    );
    if (!sub.rows.length) {
      return res.status(402).json({ error: `Module '${moduleKey}' not subscribed`, code: 'MODULE_NOT_SUBSCRIBED' });
    }
    next();
  } catch (err) {
    next(err);
  }
};

// Role guard
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

module.exports = { authenticate, requireFirmAccess, requireModule, requireRole };
