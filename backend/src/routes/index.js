const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

const authCtrl = require('../controllers/authController');
const firmCtrl = require('../controllers/firmController');
const vendorCtrl = require('../controllers/vendorController');
const collectionCtrl = require('../controllers/collectionController');
const userCtrl = require('../controllers/userController');
const subCtrl = require('../controllers/subscriptionController');
const reportCtrl = require('../controllers/reportController');
const { authenticate, requireFirmAccess, requireModule, requireRole } = require('../middleware/auth');

// ── AUTH ──────────────────────────────────────────────────────
router.post('/auth/register',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('fullName').trim().notEmpty(),
  body('tenantName').trim().notEmpty(),
  authCtrl.register
);
router.post('/auth/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  authCtrl.login
);
router.post('/auth/refresh', authCtrl.refresh);
router.post('/auth/logout', authCtrl.logout);
router.get('/auth/me', authenticate, authCtrl.me);

// ── SUBSCRIPTIONS ─────────────────────────────────────────────
router.get('/subscriptions/plans', subCtrl.listPlans);
router.get('/subscriptions/my', authenticate, subCtrl.getMySubscription);
router.post('/subscriptions/module', authenticate, requireRole('tenant_admin'), subCtrl.subscribeModule);
router.post('/subscriptions/upgrade', authenticate, requireRole('tenant_admin'), subCtrl.upgradePlan);

// ── USERS ─────────────────────────────────────────────────────
router.get('/users', authenticate, requireRole('tenant_admin'), userCtrl.listUsers);
router.post('/users',
  authenticate, requireRole('tenant_admin'),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('fullName').trim().notEmpty(),
  userCtrl.createUser
);
router.put('/users/:userId', authenticate, requireRole('tenant_admin'), userCtrl.updateUser);
router.put('/users/:userId/password', authenticate, userCtrl.changePassword);

// ── FIRMS ─────────────────────────────────────────────────────
router.get('/firms', authenticate, firmCtrl.listFirms);
router.post('/firms',
  authenticate, requireRole('tenant_admin'),
  body('name').trim().notEmpty(),
  firmCtrl.createFirm
);
router.put('/firms/:firmId', authenticate, requireRole('tenant_admin'), firmCtrl.updateFirm);
router.get('/firms/:firmId/users', authenticate, requireFirmAccess, firmCtrl.getFirmUsers);
router.post('/firms/:firmId/users', authenticate, requireRole('tenant_admin'), requireFirmAccess, firmCtrl.addUserToFirm);

// ── VENDOR LEDGER ─────────────────────────────────────────────
router.get('/firms/:firmId/vendors',
  authenticate, requireFirmAccess, requireModule('vendor_ledger'),
  vendorCtrl.listVendors
);
router.post('/firms/:firmId/vendors',
  authenticate, requireFirmAccess, requireModule('vendor_ledger'),
  body('name').trim().notEmpty(),
  vendorCtrl.createVendor
);
router.put('/firms/:firmId/vendors/:vendorId',
  authenticate, requireFirmAccess, requireModule('vendor_ledger'),
  vendorCtrl.updateVendor
);
router.get('/firms/:firmId/vendors/:vendorId/transactions',
  authenticate, requireFirmAccess, requireModule('vendor_ledger'),
  vendorCtrl.getVendorLedger
);
router.post('/firms/:firmId/vendors/:vendorId/transactions',
  authenticate, requireFirmAccess, requireModule('vendor_ledger'),
  body('txnDate').isDate(),
  body('txnType').isIn(['advance','debit','credit','mnp']),
  body('amount').isFloat({ min: 0 }),
  vendorCtrl.addTransaction
);
router.delete('/firms/:firmId/vendors/:vendorId/transactions/:txnId',
  authenticate, requireFirmAccess, requireModule('vendor_ledger'),
  requireRole('tenant_admin','firm_admin'),
  vendorCtrl.deleteTransaction
);

// ── MARKET COLLECTION ─────────────────────────────────────────
router.get('/firms/:firmId/retailers',
  authenticate, requireFirmAccess, requireModule('market_collection'),
  collectionCtrl.listRetailers
);
router.post('/firms/:firmId/retailers',
  authenticate, requireFirmAccess, requireModule('market_collection'),
  body('name').trim().notEmpty(),
  collectionCtrl.createRetailer
);
router.put('/firms/:firmId/retailers/:retailerId',
  authenticate, requireFirmAccess, requireModule('market_collection'),
  collectionCtrl.updateRetailer
);
router.get('/firms/:firmId/collections',
  authenticate, requireFirmAccess, requireModule('market_collection'),
  collectionCtrl.listCollections
);
router.post('/firms/:firmId/collections',
  authenticate, requireFirmAccess, requireModule('market_collection'),
  body('retailerId').isUUID(),
  body('txnDate').isDate(),
  body('creditAmount').optional().isFloat({ min: 0 }),
  body('collectedAmount').optional().isFloat({ min: 0 }),
  body('paymentMode').optional().isIn(['cash','upi','cheque','bank','credit']),
  collectionCtrl.addCollection
);
router.get('/firms/:firmId/collection/agents',
  authenticate, requireFirmAccess, requireModule('market_collection'),
  collectionCtrl.getAgentsSummary
);
router.get('/firms/:firmId/collection/outstanding',
  authenticate, requireFirmAccess, requireModule('market_collection'),
  collectionCtrl.getRetailerOutstanding
);

// —— REPORTS (requires 'reports' module; data sections also require their base modules) ——
router.get('/firms/:firmId/reports/summary',
  authenticate,
  requireFirmAccess,
  requireRole('tenant_admin', 'firm_admin', 'accountant', 'viewer'),
  requireModule('reports'),
  query('from').optional().isISO8601({ strict: true, strictSeparator: true }),
  query('to').optional().isISO8601({ strict: true, strictSeparator: true }),
  reportCtrl.getSummary
);

router.get('/firms/:firmId/reports/vendor-transactions',
  authenticate,
  requireFirmAccess,
  requireRole('tenant_admin', 'firm_admin', 'accountant', 'viewer'),
  requireModule('reports'),
  requireModule('vendor_ledger'),
  query('from').optional().isISO8601({ strict: true, strictSeparator: true }),
  query('to').optional().isISO8601({ strict: true, strictSeparator: true }),
  query('page').optional().isInt({ min: 1, max: 100000 }),
  query('limit').optional().isInt({ min: 1, max: 500 }),
  query('vendorId').optional().isUUID(),
  query('txnType').optional().isIn(['advance', 'debit', 'credit', 'mnp']),
  reportCtrl.listVendorTransactions
);

router.get('/firms/:firmId/reports/collections',
  authenticate,
  requireFirmAccess,
  requireRole('tenant_admin', 'firm_admin', 'accountant', 'viewer'),
  requireModule('reports'),
  requireModule('market_collection'),
  query('from').optional().isISO8601({ strict: true, strictSeparator: true }),
  query('to').optional().isISO8601({ strict: true, strictSeparator: true }),
  query('page').optional().isInt({ min: 1, max: 100000 }),
  query('limit').optional().isInt({ min: 1, max: 500 }),
  query('retailerId').optional().isUUID(),
  query('collectedBy').optional().isUUID(),
  reportCtrl.listCollectionTransactions
);

module.exports = router;
