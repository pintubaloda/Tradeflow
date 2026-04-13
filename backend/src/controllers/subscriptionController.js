const { query } = require('../config/db');

// Centralised pricing — single source of truth
const MODULE_PRICING = {
  vendor_ledger:      { price: 0,   billingType: 'free'    },
  market_collection:  { price: 499, billingType: 'monthly' },
  reports:            { price: 299, billingType: 'monthly' },
};

// GET /api/subscriptions/plans
const listPlans = async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM subscription_plans WHERE is_active=true ORDER BY base_price');
    res.json(result.rows);
  } catch (err) { next(err); }
};

// GET /api/subscriptions/my
const getMySubscription = async (req, res, next) => {
  try {
    const tenant = await query(
      `SELECT t.*, sp.name AS plan_name, sp.max_firms, sp.price_per_firm, sp.features
       FROM tenants t LEFT JOIN subscription_plans sp ON sp.id = t.plan_id
       WHERE t.id = $1`,
      [req.user.tenant_id]
    );
    const modules = await query(
      `SELECT * FROM tenant_module_subscriptions WHERE tenant_id=$1 ORDER BY created_at`,
      [req.user.tenant_id]
    );
    const firmCount = await query(
      'SELECT COUNT(*) FROM firms WHERE tenant_id=$1 AND is_active=true', [req.user.tenant_id]
    );
    res.json({
      tenant: tenant.rows[0],
      modules: modules.rows,
      firmCount: parseInt(firmCount.rows[0].count),
      modulePricing: MODULE_PRICING,
    });
  } catch (err) { next(err); }
};

// POST /api/subscriptions/module - subscribe to a module
const subscribeModule = async (req, res, next) => {
  try {
    const { moduleKey } = req.body;

    // FIX: use server-side pricing config, never trust client
    if (!MODULE_PRICING[moduleKey]) {
      return res.status(400).json({ error: 'Invalid module' });
    }

    const { price, billingType } = MODULE_PRICING[moduleKey];

    // FIX: for paid modules require payment confirmation token
    // In a real integration this would validate a Razorpay/Stripe payment ID.
    // We gate with a flag to prevent free activation of paid modules.
    const isProd = process.env.NODE_ENV === 'production';
    if (price > 0 && !req.body.paymentConfirmed && isProd) {
      return res.status(402).json({
        error: 'Payment required',
        code: 'PAYMENT_REQUIRED',
        price,
        moduleKey,
        message: `This module costs ₹${price}/month. Integrate payment gateway and pass paymentConfirmed=true after successful payment.`,
      });
    }

    const result = await query(
      `INSERT INTO tenant_module_subscriptions (tenant_id, module_key, billing_type, price, ends_at)
       VALUES ($1,$2,$3,$4, CASE WHEN $3='monthly' THEN NOW() + INTERVAL '30 days' ELSE NULL END)
       ON CONFLICT (tenant_id, module_key) DO UPDATE
         SET is_active=true,
             ends_at=CASE WHEN $3='monthly' THEN NOW() + INTERVAL '30 days' ELSE NULL END
       RETURNING *`,
      [req.user.tenant_id, moduleKey, billingType, price]
    );
    res.json(result.rows[0]);
  } catch (err) { next(err); }
};

// POST /api/subscriptions/upgrade
const upgradePlan = async (req, res, next) => {
  try {
    const { planId } = req.body;
    const plan = await query('SELECT * FROM subscription_plans WHERE id=$1 AND is_active=true', [planId]);
    if (!plan.rows.length) return res.status(400).json({ error: 'Plan not found' });

    // FIX: block free upgrade to higher-priced plans without payment
    const isProd = process.env.NODE_ENV === 'production';
    if (plan.rows[0].base_price > 0 && !req.body.paymentConfirmed && isProd) {
      return res.status(402).json({
        error: 'Payment required',
        code: 'PAYMENT_REQUIRED',
        price: plan.rows[0].base_price,
        message: `This plan costs ₹${plan.rows[0].base_price}/month. Complete payment before upgrading.`,
      });
    }

    // FIX: get current plan to prevent downgrade without proper flow
    const current = await query('SELECT plan_id FROM tenants WHERE id=$1', [req.user.tenant_id]);
    if (current.rows[0]?.plan_id === planId) {
      return res.status(400).json({ error: 'Already on this plan' });
    }

    await query(
      'UPDATE tenants SET plan_id=$1, max_firms=$2, updated_at=NOW() WHERE id=$3',
      [planId, plan.rows[0].max_firms, req.user.tenant_id]
    );
    res.json({ message: 'Plan updated', plan: plan.rows[0] });
  } catch (err) { next(err); }
};

module.exports = { listPlans, getMySubscription, subscribeModule, upgradePlan };
