-- =============================================================================
-- TASKMONEY AGENT SCHEMA MIGRATION
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Sites Directory & ToS Rules
CREATE TABLE IF NOT EXISTS public.taskmoney_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT NOT NULL UNIQUE,
    site_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    category TEXT DEFAULT 'task_earning',
    tos_automation_allowed BOOLEAN DEFAULT FALSE,
    tos_summary TEXT,
    risk_score INT CHECK (risk_score BETWEEN 1 AND 10) DEFAULT 5,
    requires_kyc BOOLEAN DEFAULT FALSE,
    min_withdrawal_vnd NUMERIC(16, 2) DEFAULT 50000,
    supported_payout_methods JSONB DEFAULT '["paypal", "bank_transfer"]',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Detailed Site Analyses
CREATE TABLE IF NOT EXISTS public.taskmoney_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES public.taskmoney_sites(id) ON DELETE CASCADE,
    researcher_agent_version TEXT NOT NULL DEFAULT 'v1.0.0',
    tos_text_snapshot TEXT,
    anti_bot_systems JSONB DEFAULT '[]',
    human_checkpoints JSONB DEFAULT '[]',
    earning_potential_rating TEXT CHECK (earning_potential_rating IN ('LOW', 'MEDIUM', 'HIGH')) DEFAULT 'MEDIUM',
    strategy_recommendation TEXT NOT NULL,
    is_approved_for_automation BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Site Accounts (Encrypted Credentials)
CREATE TABLE IF NOT EXISTS public.taskmoney_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES public.taskmoney_sites(id) ON DELETE CASCADE,
    username_alias TEXT NOT NULL,
    encrypted_credentials TEXT NOT NULL, -- AES-256-GCM encoded base64
    account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'warning', 'banned', 'cooldown')),
    current_site_balance NUMERIC(16, 4) DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    last_verified_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tasks & Executions
CREATE TABLE IF NOT EXISTS public.taskmoney_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES public.taskmoney_sites(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    task_url TEXT NOT NULL,
    instruction_steps JSONB NOT NULL DEFAULT '[]',
    expected_reward_vnd NUMERIC(16, 2) NOT NULL DEFAULT 0,
    max_duration_seconds INT DEFAULT 300,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'ANALYZING', 'READY', 'RUNNING', 'WAITING_HUMAN', 'COMPLETED', 'FAILED', 'CANCELLED'
    )),
    priority INT DEFAULT 50,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.taskmoney_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.taskmoney_tasks(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.taskmoney_accounts(id),
    worker_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'WAITING_HUMAN', 'COMPLETED', 'FAILED')),
    actual_reward_earned NUMERIC(16, 2) DEFAULT 0,
    browser_session_id TEXT,
    human_intervention_reason TEXT,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.taskmoney_browser_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES public.taskmoney_executions(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    target_selector TEXT,
    action_details JSONB DEFAULT '{}',
    screenshot_url TEXT,
    status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'blocked_captcha')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Logical Balances & Safe Withdrawal Requests
CREATE TABLE IF NOT EXISTS public.taskmoney_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES public.taskmoney_sites(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.taskmoney_accounts(id) ON DELETE CASCADE,
    confirmed_balance_vnd NUMERIC(16, 2) NOT NULL DEFAULT 0,
    pending_balance_vnd NUMERIC(16, 2) NOT NULL DEFAULT 0,
    locked_for_withdrawal_vnd NUMERIC(16, 2) NOT NULL DEFAULT 0,
    last_reconciliation_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.taskmoney_withdrawal_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    balance_id UUID NOT NULL REFERENCES public.taskmoney_balances(id),
    destination_type TEXT NOT NULL CHECK (destination_type IN ('paypal', 'bank_transfer', 'crypto_usdt')),
    encrypted_destination_details TEXT NOT NULL,
    masked_destination TEXT NOT NULL,
    amount_vnd NUMERIC(16, 2) NOT NULL CHECK (amount_vnd > 0),
    fee_vnd NUMERIC(16, 2) DEFAULT 0,
    approval_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN (
        'PENDING', 'APPROVED_BY_HUMAN', 'REJECTED_BY_HUMAN', 'EXECUTING', 'COMPLETED', 'FAILED'
    )),
    approval_payload_hash TEXT NOT NULL,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    payout_evidence_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_taskmoney_sites_domain ON public.taskmoney_sites(domain);
CREATE INDEX IF NOT EXISTS idx_taskmoney_tasks_site_id ON public.taskmoney_tasks(site_id);
CREATE INDEX IF NOT EXISTS idx_taskmoney_tasks_status ON public.taskmoney_tasks(status);
CREATE INDEX IF NOT EXISTS idx_taskmoney_executions_task_id ON public.taskmoney_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_taskmoney_withdrawals_status ON public.taskmoney_withdrawal_requests(approval_status);

-- 7. Row Level Security
ALTER TABLE public.taskmoney_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taskmoney_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taskmoney_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taskmoney_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taskmoney_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taskmoney_browser_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taskmoney_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taskmoney_withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Grant access to service_role only (server-side protection)
CREATE POLICY "service_role_all_taskmoney_sites" ON public.taskmoney_sites FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_taskmoney_analyses" ON public.taskmoney_analyses FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_taskmoney_accounts" ON public.taskmoney_accounts FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_taskmoney_tasks" ON public.taskmoney_tasks FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_taskmoney_executions" ON public.taskmoney_executions FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_taskmoney_browser_logs" ON public.taskmoney_browser_logs FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_taskmoney_balances" ON public.taskmoney_balances FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_taskmoney_withdrawals" ON public.taskmoney_withdrawal_requests FOR ALL TO service_role USING (true);

