-- ============================================================
-- MIGRATION: 20261109000000_browser_automation_multiagent.sql
-- Real Multi-Agent Browser Automation Platform Schema
-- ============================================================

-- 1. BẢNG QUẢN LÝ AGENT / BOT WORKERS (bot_workers)
CREATE TABLE IF NOT EXISTS public.bot_workers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  agent_role TEXT NOT NULL CHECK (agent_role IN ('orchestrator', 'planner', 'browser_executor', 'verifier', 'supervisor')),
  status TEXT NOT NULL DEFAULT 'IDLE' CHECK (status IN ('IDLE', 'BUSY', 'OFFLINE', 'ERROR', 'PAUSED')),
  current_task_id UUID,
  current_url TEXT,
  browser_context_id TEXT,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  tasks_failed INTEGER NOT NULL DEFAULT 0,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_workers_status ON public.bot_workers (status);
CREATE INDEX IF NOT EXISTS idx_bot_workers_role ON public.bot_workers (agent_role);

-- 2. BẢNG PHIÊN THỰC THI NHIỆM VỤ THỰC TẾ (task_executions)
CREATE TABLE IF NOT EXISTS public.task_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL REFERENCES public.bot_workers(id) ON DELETE RESTRICT,
  browser_context_id TEXT,
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'WAITING_HUMAN', 'VERIFYING', 'VERIFIED_SUCCESS', 'VERIFIED_FAILURE', 'CANCELLED')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER DEFAULT 0,
  target_url TEXT,
  final_url TEXT,
  error_details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_executions_task ON public.task_executions (task_id);
CREATE INDEX IF NOT EXISTS idx_task_executions_bot ON public.task_executions (bot_id);

-- 3. BẢNG DÒNG SỰ KIỆN LIVE THỜI GIAN THỰC (execution_events)
CREATE TABLE IF NOT EXISTS public.execution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES public.task_executions(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'BOT_STARTED', 'BOT_ONLINE', 'TASK_ASSIGNED', 'TASK_STARTED',
    'BROWSER_LAUNCHED', 'PAGE_NAVIGATED', 'DOM_INSPECTED', 'ELEMENT_CLICKED',
    'FORM_FILLED', 'SCREENSHOT_CAPTURED', 'BARRIER_DETECTED',
    'HUMAN_REVIEW_REQUIRED', 'VERIFICATION_STARTED', 'VERIFIED_SUCCESS',
    'VERIFIED_FAILURE', 'TASK_COMPLETED', 'TASK_FAILED', 'TASK_CANCELLED'
  )),
  url TEXT,
  step_name TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_events_task ON public.execution_events (task_id);
CREATE INDEX IF NOT EXISTS idx_execution_events_execution ON public.execution_events (execution_id);
CREATE INDEX IF NOT EXISTS idx_execution_events_time ON public.execution_events (created_at DESC);

-- 4. BẢNG BẰNG CHỨNG HÌNH ẢNH & DOM BROWSER (task_evidence)
CREATE TABLE IF NOT EXISTS public.task_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES public.task_executions(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  screenshot_url TEXT,
  screenshot_base64 TEXT,
  page_title TEXT,
  page_url TEXT NOT NULL,
  dom_snippet TEXT,
  extracted_data JSONB DEFAULT '{}'::jsonb,
  verifier_outcome TEXT CHECK (verifier_outcome IN ('VERIFIED_SUCCESS', 'VERIFIED_FAILURE', 'NEEDS_HUMAN_REVIEW', 'INSUFFICIENT_EVIDENCE')),
  confidence_score NUMERIC(5, 2) DEFAULT 0.00,
  verifier_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_evidence_task ON public.task_evidence (task_id);

-- 5. BẢNG CỔNG PHÊ DUYỆT HUMAN-IN-THE-LOOP (human_approvals)
CREATE TABLE IF NOT EXISTS public.human_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL REFERENCES public.task_executions(id) ON DELETE CASCADE,
  checkpoint_type TEXT NOT NULL CHECK (checkpoint_type IN ('CAPTCHA', 'PHONE_OTP', 'LOGIN_2FA', 'FINANCIAL_WITHDRAWAL', 'SENSITIVE_ACTION')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'TIMEOUT')),
  page_url TEXT,
  screenshot_preview TEXT,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_human_approvals_status ON public.human_approvals (status);

-- 6. CẬP NHẬT THÊM CÁC CỘT QUẢN TRỊ TRÊN BẢNG tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS latest_evidence_id UUID REFERENCES public.task_evidence(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_url TEXT,
  ADD COLUMN IF NOT EXISTS execution_duration_ms INTEGER DEFAULT 0;

-- 7. KÍCH HOẠT ROW LEVEL SECURITY (RLS)
ALTER TABLE public.bot_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execution_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_approvals ENABLE ROW LEVEL SECURITY;

-- Cho phép Service Role toàn quyền quản trị
DROP POLICY IF EXISTS "Service role has full access to bot_workers" ON public.bot_workers;
CREATE POLICY "Service role has full access to bot_workers" ON public.bot_workers FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role has full access to task_executions" ON public.task_executions;
CREATE POLICY "Service role has full access to task_executions" ON public.task_executions FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role has full access to execution_events" ON public.execution_events;
CREATE POLICY "Service role has full access to execution_events" ON public.execution_events FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role has full access to task_evidence" ON public.task_evidence;
CREATE POLICY "Service role has full access to task_evidence" ON public.task_evidence FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role has full access to human_approvals" ON public.human_approvals;
CREATE POLICY "Service role has full access to human_approvals" ON public.human_approvals FOR ALL USING (true);

