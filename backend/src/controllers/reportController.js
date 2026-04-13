const { query } = require('../config/db');
const { validationResult } = require('express-validator');

const DAY_MS = 24 * 60 * 60 * 1000;

const toDateOnly = (d) => {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
};

const toISODate = (d) => d.toISOString().slice(0, 10);

const parseRange = (req) => {
  const today = new Date();
  const defaultTo = toISODate(today);
  const fromDefaultDate = new Date(today.getTime() - 30 * DAY_MS);
  const defaultFrom = toISODate(fromDefaultDate);

  const fromStr = req.query.from || defaultFrom;
  const toStr = req.query.to || defaultTo;

  const fromDate = toDateOnly(fromStr);
  const toDate = toDateOnly(toStr);
  if (!fromDate || !toDate) {
    const err = new Error('Invalid date range');
    err.status = 422;
    throw err;
  }
  if (fromDate.getTime() > toDate.getTime()) {
    const err = new Error("'from' must be on/before 'to'");
    err.status = 422;
    throw err;
  }
  const days = Math.floor((toDate.getTime() - fromDate.getTime()) / DAY_MS) + 1;
  if (days > 366) {
    const err = new Error('Date range too large (max 366 days)');
    err.status = 422;
    throw err;
  }
  return { from: toISODate(fromDate), to: toISODate(toDate), days };
};

const getActiveModules = async (tenantId) => {
  const res = await query(
    `SELECT module_key FROM tenant_module_subscriptions
     WHERE tenant_id=$1 AND is_active=true AND (ends_at IS NULL OR ends_at > NOW())`,
    [tenantId]
  );
  return res.rows.map(r => r.module_key);
};

// GET /api/firms/:firmId/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
const getSummary = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const range = parseRange(req);
    const activeModules = await getActiveModules(req.user.tenant_id);

    const vendorEnabled = activeModules.includes('vendor_ledger');
    const collectionEnabled = activeModules.includes('market_collection');

    const out = {
      range,
      vendor: { enabled: vendorEnabled },
      collection: { enabled: collectionEnabled },
      topVendors: [],
      topRetailers: [],
      agents: [],
    };

    if (vendorEnabled) {
      const vendorStats = await query(
        `SELECT
          COUNT(*) AS active_vendors,
          COALESCE(SUM(GREATEST(bal,0)),0) AS dr_outstanding,
          COALESCE(SUM(GREATEST(-bal,0)),0) AS cr_outstanding
         FROM (
           SELECT COALESCE(vt.closing_balance, v.opening_balance) AS bal
           FROM vendors v
           LEFT JOIN LATERAL (
             SELECT closing_balance FROM vendor_transactions
             WHERE vendor_id=v.id ORDER BY txn_date DESC, created_at DESC LIMIT 1
           ) vt ON true
           WHERE v.firm_id=$1 AND v.is_active=true
         ) s`,
        [req.firmId]
      );

      const vendorPeriod = await query(
        `SELECT
          COALESCE(SUM(CASE WHEN txn_type IN ('advance','debit') THEN amount ELSE 0 END),0) AS total_dr,
          COALESCE(SUM(CASE WHEN txn_type='credit' THEN amount ELSE 0 END),0) AS total_cr,
          COALESCE(SUM(mnp_amount),0) AS total_mnp,
          COUNT(*) AS txn_count
         FROM vendor_transactions
         WHERE firm_id=$1 AND txn_date BETWEEN $2 AND $3`,
        [req.firmId, range.from, range.to]
      );

      const topVendors = await query(
        `SELECT v.id, v.name,
          COALESCE(vt.closing_balance, v.opening_balance) AS balance
         FROM vendors v
         LEFT JOIN LATERAL (
           SELECT closing_balance FROM vendor_transactions
           WHERE vendor_id=v.id ORDER BY txn_date DESC, created_at DESC LIMIT 1
         ) vt ON true
         WHERE v.firm_id=$1 AND v.is_active=true
         ORDER BY ABS(COALESCE(vt.closing_balance, v.opening_balance)) DESC, v.name ASC
         LIMIT 10`,
        [req.firmId]
      );

      out.vendor = {
        enabled: true,
        ...vendorStats.rows[0],
        period: vendorPeriod.rows[0],
      };
      out.topVendors = topVendors.rows;
    }

    if (collectionEnabled) {
      const retailerStats = await query(
        `SELECT
          COUNT(*) AS active_retailers,
          COALESCE(SUM(current_outstanding),0) AS total_outstanding
         FROM retailers
         WHERE firm_id=$1 AND is_active=true`,
        [req.firmId]
      );

      const collPeriod = await query(
        `SELECT
          COALESCE(SUM(credit_amount),0) AS total_credit,
          COALESCE(SUM(collected_amount),0) AS total_collected,
          COUNT(*) AS txn_count
         FROM collection_transactions
         WHERE firm_id=$1 AND txn_date BETWEEN $2 AND $3`,
        [req.firmId, range.from, range.to]
      );

      const topRetailers = await query(
        `SELECT id, name, area, current_outstanding, credit_limit
         FROM retailers
         WHERE firm_id=$1 AND is_active=true
         ORDER BY current_outstanding DESC, name ASC
         LIMIT 10`,
        [req.firmId]
      );

      const agents = await query(
        `SELECT u.id, u.full_name,
          COUNT(ct.id) AS collections_count,
          COALESCE(SUM(ct.collected_amount),0) AS total_collected,
          COALESCE(SUM(ct.credit_amount),0) AS total_credit
         FROM user_firm_access ufa
         JOIN users u ON u.id = ufa.user_id
         LEFT JOIN collection_transactions ct ON ct.collected_by = u.id
           AND ct.firm_id = $1 AND ct.txn_date BETWEEN $2 AND $3
         WHERE ufa.firm_id = $1 AND ufa.can_collect = true AND ufa.is_active = true
         GROUP BY u.id, u.full_name
         ORDER BY total_collected DESC, u.full_name ASC`,
        [req.firmId, range.from, range.to]
      );

      out.collection = {
        enabled: true,
        ...retailerStats.rows[0],
        period: collPeriod.rows[0],
      };
      out.topRetailers = topRetailers.rows;
      out.agents = agents.rows;
    }

    res.json(out);
  } catch (err) { next(err); }
};

// GET /api/firms/:firmId/reports/vendor-transactions
const listVendorTransactions = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const range = parseRange(req);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const params = [req.firmId, range.from, range.to];
    let where = 'vt.firm_id=$1 AND vt.txn_date BETWEEN $2 AND $3';

    if (req.query.vendorId) {
      params.push(req.query.vendorId);
      where += ` AND vt.vendor_id = $${params.length}`;
    }
    if (req.query.txnType) {
      params.push(req.query.txnType);
      where += ` AND vt.txn_type = $${params.length}`;
    }

    params.push(limit, offset);
    const rows = await query(
      `SELECT vt.*, v.name AS vendor_name, u.full_name AS created_by_name
       FROM vendor_transactions vt
       JOIN vendors v ON v.id = vt.vendor_id
       LEFT JOIN users u ON u.id = vt.created_by
       WHERE ${where}
       ORDER BY vt.txn_date DESC, vt.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const count = await query(
      `SELECT COUNT(*) FROM vendor_transactions vt WHERE ${where}`,
      countParams
    );

    res.json({
      range,
      page,
      limit,
      total: parseInt(count.rows[0].count),
      transactions: rows.rows,
    });
  } catch (err) { next(err); }
};

// GET /api/firms/:firmId/reports/collections
const listCollectionTransactions = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const range = parseRange(req);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const params = [req.firmId, range.from, range.to];
    let where = 'ct.firm_id=$1 AND ct.txn_date BETWEEN $2 AND $3';

    if (req.query.retailerId) {
      params.push(req.query.retailerId);
      where += ` AND ct.retailer_id = $${params.length}`;
    }
    if (req.query.collectedBy) {
      params.push(req.query.collectedBy);
      where += ` AND ct.collected_by = $${params.length}`;
    }

    params.push(limit, offset);
    const rows = await query(
      `SELECT ct.*, r.name AS retailer_name, r.area, u.full_name AS collector_name
       FROM collection_transactions ct
       JOIN retailers r ON r.id = ct.retailer_id
       JOIN users u ON u.id = ct.collected_by
       WHERE ${where}
       ORDER BY ct.txn_date DESC, ct.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const count = await query(
      `SELECT COUNT(*) FROM collection_transactions ct WHERE ${where}`,
      countParams
    );

    res.json({
      range,
      page,
      limit,
      total: parseInt(count.rows[0].count),
      transactions: rows.rows,
    });
  } catch (err) { next(err); }
};

module.exports = { getSummary, listVendorTransactions, listCollectionTransactions };

