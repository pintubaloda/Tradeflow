const fs = require('fs');
const path = require('path');
const { getClient } = require('../config/db');

const schemaPath = path.join(__dirname, '..', 'config', 'schema.sql');

const initDb = async () => {
  if (process.env.AUTO_DB_INIT !== 'true') return;

  const client = await getClient();
  try {
    const exists = await client.query(`SELECT to_regclass('public.subscription_plans') AS t`);
    if (exists.rows[0]?.t) {
      console.log('[db-init] schema already present; skipping');
      return;
    }

    const sql = fs.readFileSync(schemaPath, 'utf8');
    console.log('[db-init] applying schema.sql...');
    await client.query(sql);
    console.log('[db-init] schema applied');
  } finally {
    client.release();
  }
};

module.exports = initDb;

