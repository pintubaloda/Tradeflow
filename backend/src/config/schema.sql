-- ============================================================
-- TradeFlow SaaS - Complete Database Schema
-- Multi-tenant, firm-aware, module-subscription based
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TENANTS & PLANS
-- ============================================================
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL,           -- 'starter','growth','enterprise'
  max_firms INT NOT NULL DEFAULT 1,
  price_per_firm DECIMAL(10,2) NOT NULL DEFAULT 0,
  base_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  features JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  phone VARCHAR(20),
  plan_id UUID REFERENCES subscription_plans(id),
  max_firms INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tenant_module_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_key VARCHAR(50) NOT NULL,     -- 'vendor_ledger','market_collection','reports'
  is_active BOOLEAN NOT NULL DEFAULT true,
  billing_type VARCHAR(20) NOT NULL DEFAULT 'free', -- 'free','monthly','yearly','one_time'
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, module_key)
);

-- ============================================================
-- FIRMS (one tenant can have multiple firms)
-- ============================================================
CREATE TABLE firms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  address TEXT,
  phone VARCHAR(20),
  gst_number VARCHAR(20),
  pan_number VARCHAR(15),
  logo_url TEXT,
  currency VARCHAR(5) NOT NULL DEFAULT 'INR',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USERS & ROLES
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  -- 2FA (TOTP). Secrets stored encrypted at rest (see TWOFA_ENCRYPTION_KEY).
  twofa_enabled BOOLEAN NOT NULL DEFAULT false,
  twofa_secret_enc TEXT,
  twofa_temp_secret_enc TEXT,
  twofa_backup_codes_enc TEXT,
  twofa_enabled_at TIMESTAMPTZ,
  role VARCHAR(30) NOT NULL DEFAULT 'staff', -- 'tenant_admin','firm_admin','accountant','collection_boy','viewer'
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User-Firm access mapping (a collection_boy can be in multiple firms of same tenant)
CREATE TABLE user_firm_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  role_in_firm VARCHAR(30) NOT NULL DEFAULT 'staff',
  can_collect BOOLEAN NOT NULL DEFAULT false,  -- for collection boys
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, firm_id)
);

-- ============================================================
-- MODULE 1: VENDOR LEDGER
-- ============================================================
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  gst_number VARCHAR(20),
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  balance_type VARCHAR(2) NOT NULL DEFAULT 'DR', -- 'DR' or 'CR'
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vendor_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  txn_date DATE NOT NULL,
  txn_type VARCHAR(20) NOT NULL, -- 'advance','debit','credit'
  -- advance = 1st payment DR, debit = 2nd+ payment DR, credit = received CR
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  closing_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  -- closing = opening + DR - CR
  reference_no VARCHAR(50),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MODULE 2: MARKET COLLECTION
-- ============================================================
CREATE TABLE retailers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  owner_name VARCHAR(100),
  phone VARCHAR(20),
  address TEXT,
  area VARCHAR(100),
  credit_limit DECIMAL(14,2) NOT NULL DEFAULT 0,
  current_outstanding DECIMAL(14,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE collection_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  retailer_id UUID NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  collected_by UUID NOT NULL REFERENCES users(id),
  txn_date DATE NOT NULL,
  credit_amount DECIMAL(14,2) NOT NULL DEFAULT 0,   -- credit given to retailer
  collected_amount DECIMAL(14,2) NOT NULL DEFAULT 0, -- amount collected back
  outstanding_before DECIMAL(14,2) NOT NULL DEFAULT 0,
  outstanding_after DECIMAL(14,2) NOT NULL DEFAULT 0,
  payment_mode VARCHAR(20) NOT NULL DEFAULT 'cash', -- 'cash','upi','cheque','bank'
  reference_no VARCHAR(50),
  notes TEXT,
  synced_at TIMESTAMPTZ,  -- when mobile app synced this record
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MODULE 2B: COLLECTION EXECUTIVE CASH DEPOSITS (OFFICE SETTLEMENT)
-- ============================================================
-- When a collection executive collects cash in the market, it remains "pending"
-- until they deposit the cash back to office and an admin/accountant records it.
CREATE TABLE executive_cash_deposits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  executive_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deposit_date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  payment_mode VARCHAR(20) NOT NULL DEFAULT 'cash', -- typically cash; allow others for bookkeeping
  reference_no VARCHAR(50),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  firm_id UUID REFERENCES firms(id),
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  table_name VARCHAR(50),
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- REFRESH TOKENS
-- ============================================================
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_firms_tenant ON firms(tenant_id);
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_user_firm_user ON user_firm_access(user_id);
CREATE INDEX idx_user_firm_firm ON user_firm_access(firm_id);
CREATE INDEX idx_vendors_firm ON vendors(firm_id);
CREATE INDEX idx_vendor_txn_firm ON vendor_transactions(firm_id);
CREATE INDEX idx_vendor_txn_vendor ON vendor_transactions(vendor_id);
CREATE INDEX idx_vendor_txn_date ON vendor_transactions(txn_date);
CREATE INDEX idx_retailers_firm ON retailers(firm_id);
CREATE INDEX idx_collection_firm ON collection_transactions(firm_id);
CREATE INDEX idx_collection_retailer ON collection_transactions(retailer_id);
CREATE INDEX idx_collection_collector ON collection_transactions(collected_by);
CREATE INDEX idx_exec_dep_firm ON executive_cash_deposits(firm_id);
CREATE INDEX idx_exec_dep_exec ON executive_cash_deposits(executive_user_id);
CREATE INDEX idx_exec_dep_date ON executive_cash_deposits(deposit_date);
CREATE INDEX idx_audit_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ============================================================
-- SEED DATA
-- ============================================================
INSERT INTO subscription_plans (name, max_firms, price_per_firm, base_price, features) VALUES
('Starter',   1, 0,    0,    '{"vendor_ledger":true,"market_collection":false,"reports":false}'),
('Growth',    3, 199,  499,  '{"vendor_ledger":true,"market_collection":true,"reports":false}'),
('Enterprise',10,149,  999,  '{"vendor_ledger":true,"market_collection":true,"reports":true}');
