-- ============================================================
-- MIGRATION: TASKMONEY CORE SCHEMA (20261107000000)
-- Bảng phân tích ToS, tài khoản sàn, nhiệm vụ, nhật ký audit,
-- sổ cái thu nhập thực và yêu cầu rút tiền an toàn có Human Gate.
-- ============================================================

-- 1. BẢNG PHÂN TÍCH SITE & QUY ĐỊNH TOS (site_analyses)
CREATE TABLE IF NOT EXISTS public.site_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL,
  platform_name TEXT NOT NULL,
  tos_summary TEXT,
  automation_allowed BOOLEAN DEFAULT FALSE,
  automation_risk_score INT CHECK (automation_risk_score BETWEEN 1 AND 10),
  requires_kyc BOOLEAN DEFAULT FALSE,
  requires_phone_otp BOOLEAN DEFAULT FALSE,
  min_payout_usd NUMERIC(12, 2) DEFAULT 5.00,
  payout_methods JSONB DEFAULT '["paypal", "bank_transfer"]'::jsonb,
  safe_action_guidelines TEXT,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_analyses_domain ON public.site_analyses(domain);

-- 2. BẢNG TÀI KHOẢN NỀN TẢNG & SESSION (platform_accounts)
CREATE TABLE IF NOT EXISTS public.platform_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.site_analyses(id) ON DELETE RESTRICT,
  username TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  encrypted_session_cookie TEXT,
  auth_status TEXT DEFAULT 'active' CHECK (auth_status IN ('active', 'session_expired', 'captcha_required', 'blocked', 'needs_kyc')),
  last_login_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, username)
);

CREATE INDEX IF NOT EXISTS idx_platform_accounts_user ON public.platform_accounts(user_id);

-- 3. BẢNG NHIỆM VỤ THỰC THI (agent_missions)
CREATE TABLE IF NOT EXISTS public.agent_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.platform_accounts(id) ON DELETE CASCADE,
  mission_name TEXT NOT NULL,
  target_url TEXT NOT NULL,
  mission_type TEXT NOT NULL CHECK (mission_type IN ('survey', 'microtask', 'content_click', 'form_filling', 'research_check')),
  reward_estimated_usd NUMERIC(12, 4) DEFAULT 0.0000,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PLANNING', 'EXECUTING', 'WAITING_HUMAN', 'COMPLETED', 'FAILED', 'VERIFIED')),
  human_intervention_reason TEXT,
  completion_evidence TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_missions_account ON public.agent_missions(account_id);
CREATE INDEX IF NOT EXISTS idx_agent_missions_status ON public.agent_missions(status);

-- 4. BẢNG AUDIT LOG THAO TÁC CỦA TỪNG AGENT (task_action_logs)
CREATE TABLE IF NOT EXISTS public.task_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES public.agent_missions(id) ON DELETE CASCADE,
  agent_role TEXT NOT NULL CHECK (agent_role IN ('orchestrator', 'researcher', 'executor', 'verifier', 'finance')),
  action_name TEXT NOT NULL,
  input_payload JSONB,
  output_payload JSONB,
  is_success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  duration_ms INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_action_logs_mission ON public.task_action_logs(mission_id);

-- 5. SỔ CÁI DOANH THU ĐỐI SOÁT THẬT (earnings_ledger)
CREATE TABLE IF NOT EXISTS public.earnings_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.platform_accounts(id) ON DELETE RESTRICT,
  mission_id UUID REFERENCES public.agent_missions(id) ON DELETE SET NULL,
  amount_usd NUMERIC(12, 4) NOT NULL CHECK (amount_usd >= 0),
  exchange_rate_vnd NUMERIC(12, 2) DEFAULT 25400,
  verified_by_verifier_agent BOOLEAN DEFAULT FALSE,
  verification_evidence TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_earnings_ledger_account ON public.earnings_ledger(account_id);

-- 6. BẢNG YÊU CẦU RÚT TIỀN CÓ HUMAN APPROVAL (withdrawal_requests)
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.platform_accounts(id) ON DELETE RESTRICT,
  amount_usd NUMERIC(12, 2) NOT NULL CHECK (amount_usd > 0),
  destination_type TEXT NOT NULL CHECK (destination_type IN ('paypal', 'bank_transfer', 'crypto_usdt')),
  destination_account_masked TEXT NOT NULL,
  status TEXT DEFAULT 'WAITING_HUMAN_APPROVAL' CHECK (status IN ('DRAFT', 'WAITING_HUMAN_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTING', 'COMPLETED', 'FAILED')),
  human_signature_hash TEXT,
  approved_by_user_id UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  transaction_ref TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_account ON public.withdrawal_requests(account_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON public.withdrawal_requests(status);

-- ============================================================
-- 7. KÍCH HOẠT ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.site_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earnings_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Site analyses là thông tin quy định chung: Authenticated users được xem
CREATE POLICY "Authenticated users view site analyses" ON public.site_analyses
  FOR SELECT TO authenticated USING (true);

-- Platform accounts: Người dùng chỉ được xem và quản lý tài khoản của chính mình
CREATE POLICY "Users manage own platform accounts" ON public.platform_accounts
  FOR ALL TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Agent missions: Thuộc về account của user
CREATE POLICY "Users view own agent missions" ON public.agent_missions
  FOR ALL TO authenticated USING (
    account_id IN (SELECT id FROM public.platform_accounts WHERE user_id = auth.uid())
  );

-- Task action logs: Thuộc về mission của user
CREATE POLICY "Users view own task logs" ON public.task_action_logs
  FOR SELECT TO authenticated USING (
    mission_id IN (
      SELECT m.id FROM public.agent_missions m
      JOIN public.platform_accounts a ON m.account_id = a.id
      WHERE a.user_id = auth.uid()
    )
  );

-- Earnings ledger: Thuộc về account của user
CREATE POLICY "Users view own earnings ledger" ON public.earnings_ledger
  FOR SELECT TO authenticated USING (
    account_id IN (SELECT id FROM public.platform_accounts WHERE user_id = auth.uid())
  );

-- Withdrawal requests: Người dùng xem và duyệt yêu cầu rút của chính mình
CREATE POLICY "Users manage own withdrawal requests" ON public.withdrawal_requests
  FOR ALL TO authenticated USING (
    account_id IN (SELECT id FROM public.platform_accounts WHERE user_id = auth.uid())
  );

-- Service role có toàn quyền phục vụ background worker fleet
CREATE POLICY "Service role full access site_analyses" ON public.site_analyses FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access platform_accounts" ON public.platform_accounts FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access agent_missions" ON public.agent_missions FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access task_action_logs" ON public.task_action_logs FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access earnings_ledger" ON public.earnings_ledger FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access withdrawal_requests" ON public.withdrawal_requests FOR ALL TO service_role USING (true);

