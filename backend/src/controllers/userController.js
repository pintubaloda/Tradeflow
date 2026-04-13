const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { validationResult } = require('express-validator');

const ALLOWED_ROLES = ['tenant_admin', 'firm_admin', 'accountant', 'collection_boy', 'staff', 'viewer'];

// GET /api/users
const listUsers = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.full_name, u.phone, u.role, u.is_active, u.last_login_at, u.created_at,
        json_agg(json_build_object('firmId', f.id, 'firmName', f.name, 'role', ufa.role_in_firm, 'canCollect', ufa.can_collect))
          FILTER (WHERE f.id IS NOT NULL) AS firms
       FROM users u
       LEFT JOIN user_firm_access ufa ON ufa.user_id = u.id AND ufa.is_active = true
       LEFT JOIN firms f ON f.id = ufa.firm_id AND f.is_active = true
       WHERE u.tenant_id = $1
       GROUP BY u.id ORDER BY u.full_name`,
      [req.user.tenant_id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
};

// POST /api/users
const createUser = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { email, password, fullName, phone, role } = req.body;

    // FIX: whitelist roles to prevent privilege escalation
    const resolvedRole = ALLOWED_ROLES.includes(role) ? role : 'staff';

    const exists = await query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email already exists' });

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, phone, role)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, full_name, phone, role, is_active, created_at`,
      [req.user.tenant_id, email.toLowerCase(), passwordHash, fullName.trim(), phone||null, resolvedRole]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
};

// PUT /api/users/:userId
const updateUser = async (req, res, next) => {
  try {
    const { fullName, phone, role, isActive } = req.body;

    // FIX: whitelist roles
    const resolvedRole = ALLOWED_ROLES.includes(role) ? role : 'staff';

    // FIX: prevent tenant_admin from deactivating themselves
    if (req.params.userId === req.user.id && isActive === false) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }

    const result = await query(
      `UPDATE users SET full_name=$1, phone=$2, role=$3, is_active=$4, updated_at=NOW()
       WHERE id=$5 AND tenant_id=$6 RETURNING id, email, full_name, phone, role, is_active`,
      [fullName.trim(), phone||null, resolvedRole, isActive !== undefined ? isActive : true, req.params.userId, req.user.tenant_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
};

// PUT /api/users/:userId/password
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(422).json({ error: 'Password must be at least 8 characters' });
    }

    // FIX: scope lookup to tenant_id so cross-tenant IDs don't match
    const user = await query(
      'SELECT password_hash FROM users WHERE id=$1 AND tenant_id=$2',
      [req.params.userId, req.user.tenant_id]
    );
    if (!user.rows.length) return res.status(404).json({ error: 'User not found' });

    // Always require current password when changing own password
    if (req.user.id === req.params.userId) {
      if (!currentPassword) return res.status(422).json({ error: 'Current password required' });
      const valid = await bcrypt.compare(currentPassword, user.rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Current password incorrect' });
    }
    // Admins changing others' passwords: no current password needed (intentional)

    const newHash = await bcrypt.hash(newPassword, 12);
    // FIX: scope UPDATE to tenant_id as well
    await query(
      'UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3',
      [newHash, req.params.userId, req.user.tenant_id]
    );

    // Revoke all existing refresh tokens for this user so they must re-login
    await query('UPDATE refresh_tokens SET revoked=true WHERE user_id=$1', [req.params.userId]);

    res.json({ message: 'Password updated' });
  } catch (err) { next(err); }
};

module.exports = { listUsers, createUser, updateUser, changePassword };
