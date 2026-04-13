const bcrypt = require('bcryptjs');
const { getClient } = require('../config/db');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getPlanWithClient = async (client, name) => {
  const res = await client.query(
    `SELECT id, max_firms FROM subscription_plans
     WHERE is_active=true AND LOWER(name)=LOWER($1)
     LIMIT 1`,
    [name]
  );
  return res.rows[0] || null;
};

const seedDemo = async () => {
  if (process.env.DEMO_SEED !== 'true') return;

  const demoPassword = process.env.DEMO_PASSWORD || 'Tradeflow@12345';
  const tenantName = process.env.DEMO_TENANT_NAME || 'TradeFlow Demo';
  const tenantEmail = process.env.DEMO_TENANT_EMAIL || 'demo@tradeflow.local';
  const firmName = process.env.DEMO_FIRM_NAME || 'Demo Firm';

  const users = {
    tenant_admin: process.env.DEMO_ADMIN_EMAIL || 'admin@tradeflow.local',
    firm_admin: process.env.DEMO_FIRM_ADMIN_EMAIL || 'firmadmin@tradeflow.local',
    accountant: process.env.DEMO_ACCOUNTANT_EMAIL || 'accountant@tradeflow.local',
    viewer: process.env.DEMO_VIEWER_EMAIL || 'viewer@tradeflow.local',
    collection_boy: process.env.DEMO_COLLECTOR_EMAIL || 'collector@tradeflow.local',
  };

  // Retry because Railway may start the service before Postgres is ready.
  for (let attempt = 1; attempt <= 10; attempt++) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const existing = await client.query('SELECT id FROM tenants WHERE email=$1 LIMIT 1', [tenantEmail]);
      if (existing.rows.length) {
        await client.query('ROLLBACK');
        console.log(`[demo-seed] tenant already exists (${tenantEmail}); skipping`);
        return;
      }

      const plan = await getPlanWithClient(client, 'Enterprise');

      const tenant = await client.query(
        `INSERT INTO tenants (name, email, plan_id, max_firms, trial_ends_at)
         VALUES ($1,$2,$3, COALESCE($4, 10), NOW() + INTERVAL '365 days')
         RETURNING *`,
        [tenantName, tenantEmail, plan?.id || null, plan?.max_firms || null]
      );
      const tenantId = tenant.rows[0].id;

      const firm = await client.query(
        `INSERT INTO firms (tenant_id, name, currency)
         VALUES ($1,$2,'INR') RETURNING *`,
        [tenantId, firmName]
      );
      const firmId = firm.rows[0].id;

      const passwordHash = await bcrypt.hash(demoPassword, 12);

      const insertUser = async (role, email, fullName) => {
        const res = await client.query(
          `INSERT INTO users (tenant_id, email, password_hash, full_name, role, is_active)
           VALUES ($1,$2,$3,$4,$5,true) RETURNING *`,
          [tenantId, email, passwordHash, fullName, role]
        );
        return res.rows[0];
      };

      const uAdmin = await insertUser('tenant_admin', users.tenant_admin, 'Demo Admin');
      const uFirmAdmin = await insertUser('firm_admin', users.firm_admin, 'Demo Firm Admin');
      const uAcc = await insertUser('accountant', users.accountant, 'Demo Accountant');
      const uViewer = await insertUser('viewer', users.viewer, 'Demo Viewer');
      const uCollector = await insertUser('collection_boy', users.collection_boy, 'Demo Collector');

      const grantFirm = async (userId, roleInFirm, canCollect = false) => {
        await client.query(
          `INSERT INTO user_firm_access (user_id, firm_id, role_in_firm, can_collect, is_active)
           VALUES ($1,$2,$3,$4,true)
           ON CONFLICT (user_id, firm_id) DO UPDATE
             SET role_in_firm=EXCLUDED.role_in_firm, can_collect=EXCLUDED.can_collect, is_active=true`,
          [userId, firmId, roleInFirm, canCollect]
        );
      };
      await grantFirm(uAdmin.id, 'tenant_admin', false);
      await grantFirm(uFirmAdmin.id, 'firm_admin', false);
      await grantFirm(uAcc.id, 'accountant', false);
      await grantFirm(uViewer.id, 'viewer', false);
      await grantFirm(uCollector.id, 'collection_boy', true);

      // Enable all modules for demo (30 days for paid-style modules).
      const enableModule = async (key, billingType, price, endsAt) => {
        await client.query(
          `INSERT INTO tenant_module_subscriptions (tenant_id, module_key, billing_type, price, starts_at, ends_at, is_active)
           VALUES ($1,$2,$3,$4,NOW(),$5,true)
           ON CONFLICT (tenant_id, module_key) DO UPDATE
             SET is_active=true, billing_type=EXCLUDED.billing_type, price=EXCLUDED.price, starts_at=NOW(), ends_at=EXCLUDED.ends_at`,
          [tenantId, key, billingType, price, endsAt]
        );
      };
      await enableModule('vendor_ledger', 'free', 0, null);
      const endsAt30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await enableModule('market_collection', 'monthly', 499, endsAt30);
      await enableModule('reports', 'monthly', 299, endsAt30);

      // Seed a little data for reports.
      const today = new Date().toISOString().slice(0, 10);

      const v1 = await client.query(
        `INSERT INTO vendors (firm_id, name, phone, opening_balance, balance_type)
         VALUES ($1,'Sharma Traders','9999999999',0,'DR') RETURNING *`,
        [firmId]
      );
      const v2 = await client.query(
        `INSERT INTO vendors (firm_id, name, phone, opening_balance, balance_type)
         VALUES ($1,'Gupta Wholesale','8888888888',0,'DR') RETURNING *`,
        [firmId]
      );

      const addVendorTxn = async (vendorId, txnType, amount, opening, closing) => {
        await client.query(
          `INSERT INTO vendor_transactions
            (firm_id, vendor_id, txn_date, txn_type, amount, mnp_amount, opening_balance, closing_balance, reference_no, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,0,$6,$7,null,null,$8)`,
          [firmId, vendorId, today, txnType, amount, opening, closing, uAdmin.id]
        );
      };
      await addVendorTxn(v1.rows[0].id, 'advance', 10000, 0, 10000);
      await addVendorTxn(v1.rows[0].id, 'credit', 3000, 10000, 7000);
      await addVendorTxn(v2.rows[0].id, 'advance', 8000, 0, 8000);
      await addVendorTxn(v2.rows[0].id, 'credit', 1500, 8000, 6500);

      const r1 = await client.query(
        `INSERT INTO retailers (firm_id, name, owner_name, phone, area, credit_limit, current_outstanding)
         VALUES ($1,'A-One Retail','Ramesh','7777777777','Market',25000,0) RETURNING *`,
        [firmId]
      );
      const r2 = await client.query(
        `INSERT INTO retailers (firm_id, name, owner_name, phone, area, credit_limit, current_outstanding)
         VALUES ($1,'City Mart','Suresh','6666666666','City',30000,0) RETURNING *`,
        [firmId]
      );

      const addCollection = async (retailerId, creditAmount, collectedAmount, outBefore) => {
        const outAfter = outBefore + creditAmount - collectedAmount;
        await client.query(
          `INSERT INTO collection_transactions
            (firm_id, retailer_id, collected_by, txn_date, credit_amount, collected_amount,
             outstanding_before, outstanding_after, payment_mode, reference_no, notes, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'cash',null,null,NOW())`,
          [firmId, retailerId, uCollector.id, today, creditAmount, collectedAmount, outBefore, outAfter]
        );
        await client.query('UPDATE retailers SET current_outstanding=$1 WHERE id=$2', [outAfter, retailerId]);
      };
      await addCollection(r1.rows[0].id, 5000, 2000, 0);
      await addCollection(r2.rows[0].id, 6000, 1000, 0);

      await client.query('COMMIT');
      console.log('[demo-seed] created demo tenant/users/data');
      return;
    } catch (err) {
      await client.query('ROLLBACK');
      if (attempt === 10) throw err;
      console.warn(`[demo-seed] attempt ${attempt} failed: ${err.message}`);
      await sleep(1500 * attempt);
    } finally {
      client.release();
    }
  }
};

module.exports = seedDemo;
