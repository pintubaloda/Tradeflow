const { query, getClient } = require('../config/db');
const { validationResult } = require('express-validator');

// ── RETAILERS ─────────────────────────────────────────────────

const listRetailers = async (req, res, next) => {
  try {
    const { search, area } = req.query;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const params = [req.firmId];
    let where = 'r.firm_id=$1 AND r.is_active=true';
    if (search) { params.push(`%${search}%`); where += ` AND (r.name ILIKE $${params.length} OR r.phone ILIKE $${params.length})`; }
    if (area)   { params.push(area); where += ` AND r.area = $${params.length}`; }
    params.push(limit, offset);

    const result = await query(
      `SELECT r.* FROM retailers r WHERE ${where} ORDER BY r.name LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countResult = await query(
      `SELECT COUNT(*) FROM retailers WHERE firm_id=$1 AND is_active=true`, [req.firmId]
    );
    res.json({ retailers: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) { next(err); }
};

const createRetailer = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
    const { name, ownerName, phone, address, area, creditLimit } = req.body;
    const result = await query(
      `INSERT INTO retailers (firm_id, name, owner_name, phone, address, area, credit_limit)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.firmId, name, ownerName||null, phone||null, address||null, area||null, parseFloat(creditLimit)||0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
};

const updateRetailer = async (req, res, next) => {
  try {
    const { name, ownerName, phone, address, area, creditLimit } = req.body;
    const result = await query(
      `UPDATE retailers SET name=$1,owner_name=$2,phone=$3,address=$4,area=$5,credit_limit=$6,updated_at=NOW()
       WHERE id=$7 AND firm_id=$8 RETURNING *`,
      [name, ownerName||null, phone||null, address||null, area||null, parseFloat(creditLimit)||0, req.params.retailerId, req.firmId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Retailer not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
};

// ── COLLECTION TRANSACTIONS ───────────────────────────────────

const listCollections = async (req, res, next) => {
  try {
    const { from, to, retailerId, collectedBy } = req.query;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const params = [req.firmId];
    let where = 'ct.firm_id=$1';
    if (from)        { params.push(from);        where += ` AND ct.txn_date >= $${params.length}`; }
    if (to)          { params.push(to);           where += ` AND ct.txn_date <= $${params.length}`; }
    if (retailerId)  { params.push(retailerId);   where += ` AND ct.retailer_id = $${params.length}`; }
    if (collectedBy) { params.push(collectedBy);  where += ` AND ct.collected_by = $${params.length}`; }
    params.push(limit, offset);

    const result = await query(
      `SELECT ct.*, r.name AS retailer_name, r.area, u.full_name AS collector_name
       FROM collection_transactions ct
       JOIN retailers r ON r.id = ct.retailer_id
       JOIN users u ON u.id = ct.collected_by
       WHERE ${where} ORDER BY ct.txn_date DESC, ct.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const summary = await query(
      `SELECT
        COALESCE(SUM(credit_amount),0) AS total_credit,
        COALESCE(SUM(collected_amount),0) AS total_collected,
        COUNT(*) AS txn_count
       FROM collection_transactions WHERE firm_id=$1`,
      [req.firmId]
    );

    // Outstanding per retailer
    const outstanding = await query(
      `SELECT r.id, r.name, r.area, r.current_outstanding, r.credit_limit
       FROM retailers r WHERE r.firm_id=$1 AND r.is_active=true AND r.current_outstanding > 0
       ORDER BY r.current_outstanding DESC LIMIT 20`,
      [req.firmId]
    );

    res.json({
      transactions: result.rows,
      summary: summary.rows[0],
      topOutstanding: outstanding.rows,
    });
  } catch (err) { next(err); }
};

const addCollection = async (req, res, next) => {
  // FIX: validate BEFORE acquiring client / starting transaction
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { retailerId, txnDate, creditAmount, collectedAmount, paymentMode, referenceNo, notes } = req.body;

    // If collection_boy, verify they have can_collect access to this firm
    if (req.user.role === 'collection_boy' && !req.canCollect) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Collection access not granted for this firm' });
    }

    const retailer = await client.query(
      'SELECT * FROM retailers WHERE id=$1 AND firm_id=$2 FOR UPDATE',
      [retailerId, req.firmId]
    );
    if (!retailer.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Retailer not found' });
    }

    const r = retailer.rows[0];
    const credit    = parseFloat(creditAmount)    || 0;
    const collected = parseFloat(collectedAmount) || 0;
    const outBefore = parseFloat(r.current_outstanding);
    const outAfter  = outBefore + credit - collected;

    const result = await client.query(
      `INSERT INTO collection_transactions
         (firm_id, retailer_id, collected_by, txn_date, credit_amount, collected_amount,
          outstanding_before, outstanding_after, payment_mode, reference_no, notes, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) RETURNING *`,
      [req.firmId, retailerId, req.user.id, txnDate, credit, collected,
       outBefore, outAfter, paymentMode||'cash', referenceNo||null, notes||null]
    );

    await client.query(
      'UPDATE retailers SET current_outstanding=$1, updated_at=NOW() WHERE id=$2',
      [outAfter, retailerId]
    );

    await client.query('COMMIT');

    if (req.wsBroadcast) {
      req.wsBroadcast(req.user.tenant_id, req.firmId, {
        event: 'collection_added',
        data: { ...result.rows[0], retailer_name: r.name, collector_name: req.user.full_name },
      });
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// GET /api/firms/:firmId/collection/agents - agents with their daily summary
const getAgentsSummary = async (req, res, next) => {
  try {
    const { date } = req.query;
    const txnDate = date || new Date().toISOString().split('T')[0];
    const result = await query(
      `SELECT u.id, u.full_name, u.phone,
        COUNT(ct.id) AS collections_count,
        COALESCE(SUM(ct.collected_amount),0) AS total_collected,
        COALESCE(SUM(ct.credit_amount),0) AS total_credit
       FROM user_firm_access ufa
       JOIN users u ON u.id = ufa.user_id
       LEFT JOIN collection_transactions ct ON ct.collected_by = u.id
         AND ct.firm_id = $1 AND ct.txn_date = $2
       WHERE ufa.firm_id = $1 AND ufa.can_collect = true AND ufa.is_active = true
       GROUP BY u.id, u.full_name, u.phone
       ORDER BY total_collected DESC`,
      [req.firmId, txnDate]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
};

// GET /api/firms/:firmId/collection/retailer-outstanding
const getRetailerOutstanding = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT r.id, r.name, r.owner_name, r.phone, r.area, r.credit_limit, r.current_outstanding,
        ROUND(CASE WHEN r.credit_limit > 0 THEN (r.current_outstanding / r.credit_limit * 100) ELSE 0 END, 1) AS utilization_pct,
        (SELECT ct.txn_date FROM collection_transactions ct WHERE ct.retailer_id=r.id ORDER BY ct.txn_date DESC LIMIT 1) AS last_txn_date
       FROM retailers r WHERE r.firm_id=$1 AND r.is_active=true
       ORDER BY r.current_outstanding DESC`,
      [req.firmId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
};

module.exports = { listRetailers, createRetailer, updateRetailer, listCollections, addCollection, getAgentsSummary, getRetailerOutstanding };
