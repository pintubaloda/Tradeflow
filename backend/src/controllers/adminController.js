const seedDemo = require('../utils/seedDemo');
const initDb = require('../utils/initDb');

// POST /api/admin/demo-seed
// Protected by x-seed-token header (or ?token=) and must be explicitly enabled.
const demoSeed = async (req, res, next) => {
  try {
    if (process.env.DEMO_SEED_ENDPOINT !== 'true') {
      return res.status(404).json({ error: 'Not found' });
    }

    const token = req.get('x-seed-token') || req.query.token || '';
    if (!process.env.SEED_TOKEN || token !== process.env.SEED_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Ensure schema exists (safe no-op if already initialized)
    const prevAuto = process.env.AUTO_DB_INIT;
    process.env.AUTO_DB_INIT = 'true';
    await initDb();
    process.env.AUTO_DB_INIT = prevAuto;

    await seedDemo({ force: true });

    const password = process.env.DEMO_PASSWORD || 'Tradeflow@12345';
    res.json({
      ok: true,
      password,
      tenantEmail: process.env.DEMO_TENANT_EMAIL || 'demo@tradeflow.local',
      tenantName: process.env.DEMO_TENANT_NAME || 'TradeFlow Demo',
      firmName: process.env.DEMO_FIRM_NAME || 'Demo Firm',
      users: {
        tenant_admin: process.env.DEMO_ADMIN_EMAIL || 'admin@tradeflow.local',
        firm_admin: process.env.DEMO_FIRM_ADMIN_EMAIL || 'firmadmin@tradeflow.local',
        accountant: process.env.DEMO_ACCOUNTANT_EMAIL || 'accountant@tradeflow.local',
        viewer: process.env.DEMO_VIEWER_EMAIL || 'viewer@tradeflow.local',
        collection_boy: process.env.DEMO_COLLECTOR_EMAIL || 'collector@tradeflow.local',
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { demoSeed };

