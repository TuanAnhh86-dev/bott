-- Migration: 20261109000000_multi_agent_browser_platform.sql
-- Real Multi-Agent Browser Automation Platform Entities

CREATE TABLE IF NOT EXISTS public.browser_bots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IDLE',
  current_task_id TEXT,
  current_url TEXT,
  current_step TEXT,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  tasks_failed INTEGER NOT NULL DEFAULT 0,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.browser_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  target_url TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'browser_automation',
  priority INTEGER NOT NULL DEFAULT 50,
  assigned_bot_id TEXT REFERENCES public.browser_bots(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  requires_human_review BOOLEAN NOT NULL DEFAULT FALSE,
  human_review_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.browser_executions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES public.browser_tasks(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL,
  target_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  duration_ms INTEGER,
  screenshots JSONB DEFAULT '[]',
  dom_evidence JSONB DEFAULT '{}',
  verification_outcome TEXT,
  verification_reason TEXT,
  human_intervention_reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.execution_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  bot_id TEXT,
  task_id TEXT,
  execution_id TEXT,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS across all tables
ALTER TABLE public.browser_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.browser_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.browser_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execution_events ENABLE ROW LEVEL SECURITY;

-- Grant least-privilege policies to service_role and authenticated admins
CREATE POLICY admin_browser_bots_all ON public.browser_bots FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_browser_tasks_all ON public.browser_tasks FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_browser_executions_all ON public.browser_executions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_execution_events_all ON public.execution_events FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

