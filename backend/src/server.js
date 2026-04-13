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
if (isProd) app.set('trust proxy', 1);

// ── SECURITY HEADERS ──────────────────────────────────────────
app.use(helmet());

// FIX SECURITY: Never allow wildcard CORS in production
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
  : (isProd ? [] : ['http://localhost:3000']);

if (isProd && allowedOrigins.length === 0) {
  console.error('FATAL: FRONTEND_URL must be set in production');
  process.exit(1);
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (curl, mobile apps) in dev only
    if (!origin && !isProd) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

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

// Health check (no sensitive info)
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler (must be last)
app.use(errorHandler);

// ── WEBSOCKET ─────────────────────────────────────────────────
wsManager.init(server);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`TradeFlow API running on :${PORT} [${isProd ? 'production' : 'development'}]`));

// Optional: create demo tenant/users/data (idempotent; controlled by env flag).
seedDemo().catch((e) => console.error('[demo-seed] failed:', e.message));

module.exports = { app, server };
