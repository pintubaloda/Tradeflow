const { Pool } = require('pg');

const parseBool = (v) => {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return null;
};

// IMPORTANT:
// - Many managed Postgres providers require SSL in production.
// - Local Docker/Compose Postgres typically does NOT support SSL.
// Default to NO SSL unless explicitly enabled via env.
const shouldUseSsl = () => {
  const explicit = parseBool(process.env.DATABASE_SSL);
  if (explicit !== null) return explicit;

  const url = process.env.DATABASE_URL || '';
  // If sslmode=disable is explicitly set, honor it.
  if (/sslmode=disable/i.test(url)) return false;

  // Local Docker/Compose Postgres typically does NOT support SSL.
  // Some PaaS/CI environments set PGSSLMODE=require globally; don't let that
  // break internal service-to-service connections (hostname "postgres").
  try {
    const parsed = new URL(url);
    const host = (parsed.hostname || '').toLowerCase();
    const isLocalHost = host === 'postgres' || host === 'localhost' || host === '127.0.0.1';
    if (isLocalHost) {
      // Only enable SSL for local hostnames if explicitly required in URL.
      return /sslmode=(require|verify-ca|verify-full)/i.test(url);
    }
  } catch (_) {
    // ignore URL parse failures; fall through to env-based logic
  }

  const sslmode = (process.env.PGSSLMODE || '').toLowerCase();
  if (['require', 'verify-ca', 'verify-full'].includes(sslmode)) return true;

  // Also allow enabling via DATABASE_URL query string (?sslmode=require)
  if (/sslmode=(require|verify-ca|verify-full)/i.test(url)) return true;

  return false;
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSsl() ? { rejectUnauthorized: parseBool(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED) ?? false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error', err);
});

const query = (text, params) => pool.query(text, params);

const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
