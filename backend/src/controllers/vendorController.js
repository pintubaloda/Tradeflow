const { query, getClient } = require('../config/db');
const { validationResult } = require('express-validator');

// ── VENDORS ──────────────────────────────────────────────────

// GET /api/firms/:firmId/vendors
const listVendors = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const { search } = req.query;
    let sql = `SELECT v.*,
      COALESCE((SELECT closing_balance FROM vendor_transactions WHERE vendor_id=v.id ORDER BY txn_date DESC, created_at DESC LIMIT 1), v.opening_balance) AS current_balance
      FROM vendors v WHERE v.firm_id = $1 AND v.is_active = true`;
    const params = [req.firmId];
    if (search) {
      sql += ` AND (v.name ILIKE $2 OR v.phone ILIKE $2)`;
      params.push(`%${search}%`);
    }
    sql += ` ORDER BY v.name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const result = await query(sql, params);

    const countResult = await query(
      `SELECT COUNT(*) FROM vendors WHERE firm_id = $1 AND is_active = true`,
      [req.firmId]
    );
    res.json({ vendors: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) { next(err); }
};

// POST /api/firms/:firmId/vendors
const createVendor = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { name, phone, address, gstNumber, openingBalance, balanceType, notes } = req.body;
    const result = await query(
      `INSERT INTO vendors (firm_id, name, phone, address, gst_number, opening_balance, balance_type, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.firmId, name, phone||null, address||null, gstNumber||null,
       parseFloat(openingBalance)||0, balanceType||'DR', notes||null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
};

// PUT /api/firms/:firmId/vendors/:vendorId
const updateVendor = async (req, res, next) => {
  try {
    const { name, phone, address, gstNumber, notes } = req.body;
    const result = await query(
      `UPDATE vendors SET name=$1,phone=$2,address=$3,gst_number=$4,notes=$5,updated_at=NOW()
       WHERE id=$6 AND firm_id=$7 RETURNING *`,
      [name, phone||null, address||null, gstNumber||null, notes||null, req.params.vendorId, req.firmId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Vendor not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
};

// ── TRANSACTIONS ─────────────────────────────────────────────

// GET /api/firms/:firmId/vendors/:vendorId/transactions
const getVendorLedger = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * limit;
    const params = [req.firmId, req.params.vendorId];
    let where = 'vt.firm_id=$1 AND vt.vendor_id=$2';
    if (from) { params.push(from); where += ` AND vt.txn_date >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND vt.txn_date <= $${params.length}`; }
    params.push(limit, offset);

    const result = await query(
      `SELECT vt.*, u.full_name AS created_by_name
       FROM vendor_transactions vt LEFT JOIN users u ON u.id = vt.created_by
       WHERE ${where} ORDER BY vt.txn_date ASC, vt.created_at ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    // Get vendor info + opening balance
    const vendor = await query('SELECT * FROM vendors WHERE id=$1 AND firm_id=$2', [req.params.vendorId, req.firmId]);
    if (!vendor.rows.length) return res.status(404).json({ error: 'Vendor not found' });

    // Summary
    const summary = await query(
      `SELECT
        COALESCE(SUM(CASE WHEN txn_type IN ('advance','debit') THEN amount ELSE 0 END),0) AS total_dr,
        COALESCE(SUM(CASE WHEN txn_type = 'credit' THEN amount ELSE 0 END),0) AS total_cr,
        COALESCE(SUM(mnp_amount),0) AS total_mnp
       FROM vendor_transactions WHERE firm_id=$1 AND vendor_id=$2`,
      [req.firmId, req.params.vendorId]
    );

    res.json({
      vendor: vendor.rows[0],
      transactions: result.rows,
      summary: summary.rows[0],
    });
  } catch (err) { next(err); }
};

// POST /api/firms/:firmId/vendors/:vendorId/transactions
const addTransaction = async (req, res, next) => {
  // FIX: validate BEFORE acquiring client / starting transaction
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { txnDate, txnType, amount, mnpAmount, referenceNo, notes } = req.body;
    const vendorId = req.params.vendorId;

    // Verify vendor belongs to firm (inside transaction with row lock)
    const vendor = await client.query(
      'SELECT * FROM vendors WHERE id=$1 AND firm_id=$2 FOR UPDATE',
      [vendorId, req.firmId]
    );
    if (!vendor.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // Get latest closing balance
    const lastTxn = await client.query(
      `SELECT closing_balance FROM vendor_transactions
       WHERE vendor_id=$1 ORDER BY txn_date DESC, created_at DESC LIMIT 1`,
      [vendorId]
    );
    const openingBal = lastTxn.rows.length
      ? parseFloat(lastTxn.rows[0].closing_balance)
      : parseFloat(vendor.rows[0].opening_balance);

    const amt = parseFloat(amount) || 0;
    const mnp = parseFloat(mnpAmount) || 0;

    // Compute closing: opening + DR - CR + MNP
    let closingBal = openingBal;
    if (txnType === 'advance' || txnType === 'debit') closingBal += amt;
    else if (txnType === 'credit') closingBal -= amt;
    closingBal += mnp;

    const result = await client.query(
      `INSERT INTO vendor_transactions
         (firm_id, vendor_id, txn_date, txn_type, amount, mnp_amount, opening_balance, closing_balance, reference_no, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.firmId, vendorId, txnDate, txnType, amt, mnp, openingBal, closingBal, referenceNo||null, notes||null, req.user.id]
    );

    await client.query('COMMIT');

    if (req.wsBroadcast) {
      req.wsBroadcast(req.user.tenant_id, req.firmId, {
        event: 'vendor_txn_added',
        data: result.rows[0],
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

// DELETE /api/firms/:firmId/vendors/:vendorId/transactions/:txnId
// Only allow deleting the most recent transaction (to preserve ledger integrity)
const deleteTransaction = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // FIX BUG 5: verify vendor belongs to this firm first
    const vendor = await client.query(
      'SELECT id FROM vendors WHERE id=$1 AND firm_id=$2',
      [req.params.vendorId, req.firmId]
    );
    if (!vendor.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // Verify the transaction itself belongs to this vendor AND firm
    const txn = await client.query(
      'SELECT id FROM vendor_transactions WHERE id=$1 AND vendor_id=$2 AND firm_id=$3',
      [req.params.txnId, req.params.vendorId, req.firmId]
    );
    if (!txn.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const latest = await client.query(
      `SELECT id FROM vendor_transactions WHERE vendor_id=$1 ORDER BY txn_date DESC, created_at DESC LIMIT 1`,
      [req.params.vendorId]
    );
    if (!latest.rows.length || latest.rows[0].id !== req.params.txnId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only the most recent transaction can be deleted' });
    }
    await client.query('DELETE FROM vendor_transactions WHERE id=$1', [req.params.txnId]);
    await client.query('COMMIT');
    res.json({ message: 'Transaction deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = { listVendors, createVendor, updateVendor, getVendorLedger, addTransaction, deleteTransaction };
