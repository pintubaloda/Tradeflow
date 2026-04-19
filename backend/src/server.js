require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const wsManager = require('./utils/wsManager');
const seedDemo = require('./utils/seedDemo');
const initDb = require('./utils/initDb');
const migrateDb = require('./utils/migrateDb');
const { pool } = require('./config/db');

// ── STARTUP VALIDATION ────────────────────────────────────────
// FIX SECURITY: Fail fast if critical env vars are missing
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be set and at least 32 characters long');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL must be set');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const isProd = process.env.NODE_ENV === 'production';

// Behind Railway/Nginx/etc reverse proxies, trust X-Forwarded-* for correct client IPs.
if (isProd) app.set('trust proxy', true);

// ── SECURITY HEADERS ──────────────────────────────────────────
app.use(helmet());

// FIX SECURITY: Never allow wildcard CORS in production
const normalizeOrigin = (o) => (o || '').trim().replace(/\/+$/, '');
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(normalizeOrigin).filter(Boolean)
  : (isProd ? [] : ['http://localhost:3000']);

if (isProd && allowedOrigins.length === 0) {
  console.error('FATAL: FRONTEND_URL must be set in production');
  process.exit(1);
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (curl, mobile apps) in dev only
    if (!origin && !isProd) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Do not throw (preflight would become 500). Returning false yields no CORS headers.
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── RATE LIMITING ─────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts, please try again later' },
});
app.use('/api/auth', authLimiter);
app.use('/api', limiter);

// ── BODY PARSING ──────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// FIX SECURITY: Use 'combined' format in prod (no req body), 'dev' only in development
app.use(morgan(isProd ? 'combined' : 'dev'));

// ── WS BROADCAST HELPER ───────────────────────────────────────
app.use((req, res, next) => {
  req.wsBroadcast = wsManager.broadcast.bind(wsManager);
  next();
});

// ── ROUTES ────────────────────────────────────────────────────
app.use('/api', routes);

// Health checks (no sensitive info)
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('select 1');
    return res.json({ status: 'ok' });
  } catch (_) {
    return res.status(500).json({ status: 'error' });
  }
});

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler (must be last)
app.use(errorHandler);

// ── WEBSOCKET ─────────────────────────────────────────────────
wsManager.init(server);

const PORT = process.env.PORT || 4000;
const bootstrap = async () => {
  await initDb();
  await migrateDb();
  await seedDemo();
  server.listen(PORT, () => console.log(`TradeFlow API running on :${PORT} [${isProd ? 'production' : 'development'}]`));
};

bootstrap().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});

module.exports = { app, server };
