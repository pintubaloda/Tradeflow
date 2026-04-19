const { getClient } = require('../config/db');

// Idempotent schema migrations for existing databases.
// initDb() only applies schema.sql on empty DBs; this ensures new features
// (like 2FA columns / executive deposits table) are present on upgrades.
const migrateDb = async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // USERS: add 2FA columns if missing
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS twofa_enabled BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS twofa_secret_enc TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS twofa_temp_secret_enc TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS twofa_backup_codes_enc TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS twofa_enabled_at TIMESTAMPTZ`);

    // EXECUTIVE CASH DEPOSITS
    await client.query(`
      CREATE TABLE IF NOT EXISTS executive_cash_deposits (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
        executive_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        deposit_date DATE NOT NULL,
        amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        payment_mode VARCHAR(20) NOT NULL DEFAULT 'cash',
        reference_no VARCHAR(50),
        notes TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_exec_dep_firm ON executive_cash_deposits(firm_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_exec_dep_exec ON executive_cash_deposits(executive_user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_exec_dep_date ON executive_cash_deposits(deposit_date)`);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

module.exports = migrateDb;

