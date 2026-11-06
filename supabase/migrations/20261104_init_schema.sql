-- ============================================================
-- EM MÌ — Supabase Migration 001: Foundation Schema
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================
-- SECTION 1: AUTH & ROLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('super_admin', 'admin', 'viewer')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  action_category TEXT NOT NULL CHECK (action_category IN ('AUTO_EXECUTE', 'AUTO_EXECUTE_WITH_LIMITS', 'REQUIRE_APPROVAL', 'FORBIDDEN')),
  is_mutable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES public.profiles(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

-- ============================================================
-- SECTION 2: SYSTEM CONFIG & SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agent rules/constitution
CREATE TABLE IF NOT EXISTS public.rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rule_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id UUID NOT NULL REFERENCES public.rules(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rule_id, version)
);

-- System prompts
CREATE TABLE IF NOT EXISTS public.system_prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  context TEXT NOT NULL CHECK (context IN ('public_chat', 'admin_chat', 'agent', 'summarizer', 'planner', 'evaluator')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.system_prompt_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_id UUID NOT NULL REFERENCES public.system_prompts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(prompt_id, version)
);

-- ============================================================
-- SECTION 3: CONVERSATIONS & MESSAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('public', 'admin')),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  anonymous_id TEXT,
  title TEXT,
  summary TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_cached INTEGER DEFAULT 0,
  model_used TEXT,
  cost_usd NUMERIC(12, 8) DEFAULT 0,
  cost_vnd NUMERIC(16, 2) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  is_moderated BOOLEAN DEFAULT FALSE,
  moderation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTION 4: AI USAGE TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_model_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tier TEXT UNIQUE NOT NULL CHECK (tier IN ('cheap', 'standard', 'complex', 'embedding')),
  provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  max_tokens INTEGER,
  temperature NUMERIC(3, 2),
  price_input_per_m NUMERIC(10, 4),
  price_output_per_m NUMERIC(10, 4),
  price_cache_hit_per_m NUMERIC(10, 4),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  task_id UUID,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_cached INTEGER DEFAULT 0,
  latency_ms INTEGER,
  cost_usd NUMERIC(12, 8) DEFAULT 0,
  cost_vnd NUMERIC(16, 2) DEFAULT 0,
  error TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTION 5: AGENT MEMORY & STATE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memory_type TEXT NOT NULL CHECK (memory_type IN ('conversation', 'knowledge', 'business_state', 'operational', 'user_preference', 'task_history')),
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(memory_type, key)
);

-- ============================================================
-- SECTION 6: AGENT PLANS & TASKS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled', 'failed')),
  priority INTEGER NOT NULL DEFAULT 50,
  estimated_cost_vnd NUMERIC(16, 2) DEFAULT 0,
  actual_cost_vnd NUMERIC(16, 2) DEFAULT 0,
  expected_result TEXT,
  risks TEXT,
  required_permissions JSONB DEFAULT '[]',
  completion_criteria TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.agent_plan_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES public.agent_plans(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  depends_on INTEGER[],
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID REFERENCES public.agent_plans(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PLANNING','QUEUED','RUNNING','WAITING_APPROVAL','COMPLETED','FAILED','CANCELLED','PAUSED')),
  priority INTEGER NOT NULL DEFAULT 50,
  input_data JSONB DEFAULT '{}',
  current_step TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  estimated_cost_vnd NUMERIC(16, 2) DEFAULT 0,
  actual_cost_vnd NUMERIC(16, 2) DEFAULT 0,
  required_permission TEXT,
  approval_status TEXT CHECK (approval_status IN ('not_required', 'pending', 'approved', 'rejected')),
  result JSONB,
  error_details TEXT,
  idempotency_key TEXT UNIQUE,
  timeout_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.task_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.task_queue_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  queue_name TEXT NOT NULL,
  message_id TEXT,
  enqueued_at TIMESTAMPTZ,
  dequeued_at TIMESTAMPTZ,
  acked_at TIMESTAMPTZ
);

-- ============================================================
-- SECTION 7: APPROVAL WORKFLOW
-- ============================================================

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action_id TEXT NOT NULL UNIQUE,
  actor_id UUID REFERENCES public.profiles(id),
  action_type TEXT NOT NULL,
  target TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  estimated_cost_vnd NUMERIC(16, 2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'executed')),
  approver_id UUID REFERENCES public.profiles(id),
  approver_note TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  execution_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTION 8: AUDIT LOG (IMMUTABLE)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log is append-only - prevent updates and deletes
CREATE RULE audit_log_no_update AS ON UPDATE TO public.audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete AS ON DELETE TO public.audit_logs DO INSTEAD NOTHING;

-- ============================================================
-- SECTION 9: KNOWLEDGE BASE & LEARNING
-- ============================================================

CREATE TABLE IF NOT EXISTS public.learning_topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id UUID REFERENCES public.learning_topics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('text', 'url', 'pdf', 'docx', 'txt', 'csv', 'markdown')),
  source_url TEXT,
  file_path TEXT,
  file_size_bytes INTEGER,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED','DISABLED')),
  error_message TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_hash TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  total_chunks INTEGER DEFAULT 0,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  chunk_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  page_number INTEGER,
  token_count INTEGER,
  embedding vector(768),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTION 10: PLATFORMS & BUSINESS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platforms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('subscription_ppv', 'stock_media', 'ugc_brand', 'digital_products', 'clipping', 'affiliate', 'other')),
  website_url TEXT,
  api_docs_url TEXT,
  integration_status TEXT NOT NULL DEFAULT 'manual' CHECK (integration_status IN ('not_integrated', 'manual', 'api', 'oauth')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.platform_capabilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_id UUID NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  is_supported BOOLEAN NOT NULL DEFAULT FALSE,
  implementation_status TEXT NOT NULL DEFAULT 'unsupported' CHECK (implementation_status IN ('unsupported', 'manual', 'automated')),
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.platform_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_id UUID NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  policy_type TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.business_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  platform_id UUID REFERENCES public.platforms(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  monthly_target_vnd NUMERIC(16, 2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTION 11: CONTENT MANAGEMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS public.content_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('image', 'video', 'document', 'script', 'caption', 'hashtag_set', 'other')),
  storage_path TEXT,
  storage_bucket TEXT,
  public_url TEXT,
  mime_type TEXT,
  file_size_bytes BIGINT,
  width_px INTEGER,
  height_px INTEGER,
  duration_seconds NUMERIC(10, 2),
  is_adult_content BOOLEAN NOT NULL DEFAULT FALSE,
  age_verified BOOLEAN NOT NULL DEFAULT FALSE,
  consent_recorded BOOLEAN NOT NULL DEFAULT FALSE,
  copyright_owner TEXT,
  license_type TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'published', 'archived', 'deleted')),
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.content_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id UUID NOT NULL REFERENCES public.content_assets(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  storage_path TEXT,
  change_summary TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_id UUID REFERENCES public.platforms(id) ON DELETE SET NULL,
  business_model_id UUID REFERENCES public.business_models(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  brand_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled', 'paused')),
  brief TEXT,
  budget_vnd NUMERIC(16, 2),
  revenue_vnd NUMERIC(16, 2),
  deadline_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_id UUID REFERENCES public.platforms(id) ON DELETE SET NULL,
  business_model_id UUID REFERENCES public.business_models(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  product_type TEXT NOT NULL,
  price_vnd NUMERIC(16, 2),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  total_sales INTEGER DEFAULT 0,
  total_revenue_vnd NUMERIC(16, 2) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTION 12: REVENUE & FINANCIAL
-- ============================================================

CREATE TABLE IF NOT EXISTS public.revenue_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_id UUID REFERENCES public.platforms(id) ON DELETE SET NULL,
  business_model_id UUID REFERENCES public.business_models(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  revenue_type TEXT NOT NULL CHECK (revenue_type IN ('subscription', 'ppv', 'royalty', 'commission', 'sale', 'tip', 'affiliate', 'other')),
  status TEXT NOT NULL DEFAULT 'estimated' CHECK (status IN ('estimated', 'pending', 'verified', 'paid', 'cancelled', 'refunded')),
  gross_amount_vnd NUMERIC(16, 2) NOT NULL,
  platform_fee_vnd NUMERIC(16, 2) DEFAULT 0,
  net_amount_vnd NUMERIC(16, 2) GENERATED ALWAYS AS (gross_amount_vnd - platform_fee_vnd) STORED,
  currency_original TEXT DEFAULT 'VND',
  amount_original NUMERIC(16, 4),
  exchange_rate NUMERIC(12, 4),
  evidence TEXT,
  verification_method TEXT,
  verified_at TIMESTAMPTZ,
  period_start DATE,
  period_end DATE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_vnd NUMERIC(16, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'actual' CHECK (status IN ('estimated', 'actual', 'cancelled')),
  platform_id UUID REFERENCES public.platforms(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTION 13: KPI & PERFORMANCE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.monthly_kpis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  target_vnd NUMERIC(16, 2) NOT NULL,
  actual_gross_vnd NUMERIC(16, 2) DEFAULT 0,
  actual_net_vnd NUMERIC(16, 2) DEFAULT 0,
  total_expenses_vnd NUMERIC(16, 2) DEFAULT 0,
  net_profit_vnd NUMERIC(16, 2) GENERATED ALWAYS AS (actual_net_vnd - total_expenses_vnd) STORED,
  completion_pct NUMERIC(5, 2) GENERATED ALWAYS AS (
    CASE WHEN target_vnd > 0 THEN LEAST(actual_net_vnd / target_vnd * 100, 999.99) ELSE 0 END
  ) STORED,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'adjusted')),
  notes TEXT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(year, month)
);

CREATE TABLE IF NOT EXISTS public.penalty_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kpi_id UUID NOT NULL REFERENCES public.monthly_kpis(id) ON DELETE CASCADE,
  formula_used TEXT NOT NULL,
  shortfall_vnd NUMERIC(16, 2) NOT NULL,
  penalty_vnd NUMERIC(16, 2) NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'calculated' CHECK (status IN ('calculated', 'waived', 'adjusted', 'cancelled')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTION 14: NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTION 15: INDEXES
-- ============================================================

-- Conversations
CREATE INDEX IF NOT EXISTS idx_conversations_type ON public.conversations(type);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON public.conversations(created_at DESC);

-- Messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);

-- Tasks
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON public.tasks(priority DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON public.tasks(created_at DESC);

-- Knowledge chunks (vector search)
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding ON public.knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document_id ON public.knowledge_chunks(document_id);

-- Revenue
CREATE INDEX IF NOT EXISTS idx_revenue_records_status ON public.revenue_records(status);
CREATE INDEX IF NOT EXISTS idx_revenue_records_created_at ON public.revenue_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_records_platform_id ON public.revenue_records(platform_id);

-- AI usage
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON public.ai_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_id ON public.ai_usage_logs(user_id);

-- Audit
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs(actor_id);

-- Approval
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON public.approval_requests(status);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read ON public.notifications(user_id, is_read);

-- ============================================================
-- SECTION 16: ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Helper function for admin check with SECURITY DEFINER to prevent RLS infinite recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'super_admin') 
     FROM public.profiles 
     WHERE id = auth.uid()),
    FALSE
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- Profiles: users see their own, admins see all
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL USING (public.is_admin());

-- Public conversations: anon users can read their own session, write new messages
CREATE POLICY "public_conv_insert" ON public.conversations FOR INSERT WITH CHECK (type = 'public');
CREATE POLICY "public_conv_read" ON public.conversations FOR SELECT USING (type = 'public');

-- Admin conversations: only authenticated admins
CREATE POLICY "admin_conv_all" ON public.conversations FOR ALL USING (
  type = 'admin' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
);

-- Messages: readable based on conversation type
CREATE POLICY "messages_via_conversation" ON public.messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (
      c.type = 'public' OR
      (c.type = 'admin' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')))
    )
  )
);
CREATE POLICY "messages_insert" ON public.messages FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c WHERE c.id = conversation_id
  )
);

-- Revenue: admin only
CREATE POLICY "revenue_admin_only" ON public.revenue_records FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
);

-- KPI: admin only for write, public read (non-sensitive fields handled by view)
CREATE POLICY "kpi_admin_all" ON public.monthly_kpis FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
);

-- Audit logs: admin read only (no write via RLS - append only via rules)
CREATE POLICY "audit_admin_read" ON public.audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
);

-- Notifications: own user only
CREATE POLICY "notifications_own" ON public.notifications FOR ALL USING (user_id = auth.uid());

-- Tasks: admin only
CREATE POLICY "tasks_admin_only" ON public.tasks FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
);

-- Agent plans: admin only
CREATE POLICY "plans_admin_only" ON public.agent_plans FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
);

-- Approval requests: admin only
CREATE POLICY "approvals_admin_only" ON public.approval_requests FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
);

-- AI usage: own record + admin all
CREATE POLICY "ai_usage_own" ON public.ai_usage_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "ai_usage_admin" ON public.ai_usage_logs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
);

-- Knowledge chunks: authenticated read
CREATE POLICY "chunks_authenticated_read" ON public.knowledge_chunks FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "chunks_admin_write" ON public.knowledge_chunks FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
);

-- Content assets: admin manage, public read non-adult
CREATE POLICY "content_public_read" ON public.content_assets FOR SELECT USING (
  status = 'published' AND is_adult_content = FALSE
);
CREATE POLICY "content_admin_all" ON public.content_assets FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
);

-- ============================================================
-- SECTION 17: PUBLIC VIEWS (safe for anonymous access)
-- ============================================================

CREATE OR REPLACE VIEW public.v_public_kpi AS
SELECT
  year,
  month,
  target_vnd,
  actual_net_vnd,
  completion_pct,
  status
FROM public.monthly_kpis
WHERE status IN ('active', 'closed');

CREATE OR REPLACE VIEW public.v_public_stats AS
SELECT
  (SELECT COUNT(*) FROM public.tasks WHERE status = 'RUNNING') AS active_tasks,
  (SELECT COUNT(*) FROM public.tasks WHERE status = 'COMPLETED') AS completed_tasks,
  (SELECT COALESCE(SUM(net_amount_vnd), 0) FROM public.revenue_records WHERE status = 'verified') AS verified_revenue_vnd,
  (SELECT year || '-' || LPAD(month::TEXT, 2, '0') FROM public.monthly_kpis ORDER BY year DESC, month DESC LIMIT 1) AS current_period,
  NOW() AS last_updated;

-- ============================================================
-- SECTION 18: SEED DATA
-- ============================================================

-- Default AI model configs
INSERT INTO public.ai_model_configs (tier, provider, model_name, max_tokens, temperature, price_input_per_m, price_output_per_m, price_cache_hit_per_m)
VALUES
  ('cheap',     'google', 'gemini-2.0-flash',    1000, 0.7, 0.075, 0.30, 0.01875),
  ('standard',  'google', 'gemini-2.0-flash',    2000, 0.7, 0.075, 0.30, 0.01875),
  ('complex',   'google', 'gemini-2.5-pro',      4000, 0.7, 1.25,  10.0, 0.3125),
  ('embedding', 'google', 'text-embedding-004',  NULL, NULL, 0.00, 0.00, 0.00)
ON CONFLICT (tier) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  updated_at = NOW();

-- Default app settings
INSERT INTO public.app_settings (key, value, description, is_public)
VALUES
  ('kpi.monthly_target_vnd',    '5000000',                           'Monthly revenue target in VND', FALSE),
  ('kpi.currency',              '"VND"',                             'Default currency', TRUE),
  ('agent.autonomy_level',      '"AUTO"',                            'Agent autonomy level', FALSE),
  ('agent.emergency_stop',      'false',                             'Emergency stop flag', FALSE),
  ('agent.max_concurrent_tasks','3',                                 'Max concurrent agent tasks', FALSE),
  ('agent.global_pause',        'false',                             'Global worker pause', FALSE),
  ('chat.public.retention_days','30',                                'Public chat retention days', FALSE),
  ('chat.public.rate_limit_per_minute', '10',                        'Public chat rate limit', FALSE),
  ('public.show_revenue',       'true',                              'Show revenue on public dashboard', TRUE),
  ('public.show_kpi',           'true',                              'Show KPI on public dashboard', TRUE)
ON CONFLICT (key) DO NOTHING;

-- Default platforms
INSERT INTO public.platforms (name, slug, category, website_url, integration_status)
VALUES
  ('OnlyFans',      'onlyfans',      'subscription_ppv', 'https://onlyfans.com',      'not_integrated'),
  ('Fansly',        'fansly',        'subscription_ppv', 'https://fansly.com',        'not_integrated'),
  ('Patreon',       'patreon',       'subscription_ppv', 'https://patreon.com',       'not_integrated'),
  ('Adobe Stock',   'adobe-stock',   'stock_media',      'https://stock.adobe.com',   'not_integrated'),
  ('Shutterstock',  'shutterstock',  'stock_media',      'https://shutterstock.com',  'not_integrated'),
  ('Alamy',         'alamy',         'stock_media',      'https://alamy.com',         'not_integrated'),
  ('Billo',         'billo',         'ugc_brand',        'https://billo.app',         'not_integrated'),
  ('JoinBrands',    'joinbrands',    'ugc_brand',        'https://joinbrands.com',    'not_integrated'),
  ('Gumroad',       'gumroad',       'digital_products', 'https://gumroad.com',       'not_integrated'),
  ('Payhip',        'payhip',        'digital_products', 'https://payhip.com',        'not_integrated'),
  ('Stan Store',    'stan-store',    'digital_products', 'https://stan.store',        'not_integrated')
ON CONFLICT (slug) DO NOTHING;

-- Initialize current month KPI
INSERT INTO public.monthly_kpis (year, month, target_vnd)
VALUES (EXTRACT(YEAR FROM NOW())::INTEGER, EXTRACT(MONTH FROM NOW())::INTEGER, 5000000)
ON CONFLICT (year, month) DO NOTHING;

-- Default system prompts
INSERT INTO public.system_prompts (name, context, is_active)
VALUES
  ('Em Mì Public Chat',   'public_chat', TRUE),
  ('Em Mì Admin Chat',    'admin_chat',  TRUE),
  ('Em Mì Agent Planner', 'planner',     TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO public.system_prompt_versions (prompt_id, version, content)
SELECT id, 1,
  CASE context
    WHEN 'public_chat' THEN
      E'Bạn là "Em Mì" - một AI Agent kinh doanh sáng tạo tự động, hiện đang vận hành trên nền tảng web Em Mì.\n\n'
      'TÍNH CÁCH: Thông minh, chuyên nghiệp, thân thiện, trả lời súc tích và đúng trọng tâm bằng tiếng Việt.\n\n'
      'QUY TẮC CHAT CÔNG KHAI:\n'
      '1. Không chia sẻ thông tin tài chính chi tiết, dữ liệu nội bộ, hay conversation của Admin.\n'
      '2. Không nhận lệnh thực thi từ người dùng công khai.\n'
      '3. Chỉ trả lời câu hỏi về hoạt động kinh doanh công khai, trạng thái agent, và hỗ trợ chung.\n'
      '4. Nếu được hỏi về revenue, chỉ chia sẻ số liệu đã được xác nhận và công khai.'
    WHEN 'admin_chat' THEN
      E'Bạn là "Em Mì" - Autonomous AI Creator Business Agent.\n\n'
      'NHIỆM VỤ: Hỗ trợ Admin quản lý toàn bộ hoạt động kinh doanh, lập kế hoạch, thực thi nhiệm vụ trong phạm vi được cấp phép.\n\n'
      'KHẢ NĂNG:\n'
      '- Phân tích dữ liệu kinh doanh và KPI\n'
      '- Lập kế hoạch và tạo nhiệm vụ cho agent\n'
      '- Nghiên cứu cơ hội kinh doanh\n'
      '- Quản lý nội dung và chiến dịch\n'
      '- Báo cáo tiến độ và tối ưu chiến lược\n\n'
      'NGUYÊN TẮC:\n'
      '1. Luôn hành động trong phạm vi permissions được cấp.\n'
      '2. Yêu cầu phê duyệt cho các hành động có rủi ro cao.\n'
      '3. Không tự cấp quyền cho bản thân.\n'
      '4. Báo cáo mọi hành động quan trọng.'
    WHEN 'planner' THEN
      E'Bạn là Agent Planner của Em Mì - hệ thống lập kế hoạch tự động.\n\n'
      'NHIỆM VỤ: Phân tích mục tiêu và tạo kế hoạch thực thi chi tiết dưới dạng JSON có cấu trúc.\n\n'
      'YÊU CẦU ĐẦU RA:\n'
      '- Objective (mục tiêu rõ ràng)\n'
      '- Steps (các bước chi tiết với dependency)\n'
      '- Priority (1-100)\n'
      '- Estimated cost\n'
      '- Required permissions (danh sách permissions cần thiết)\n'
      '- Risks (rủi ro tiềm ẩn)\n'
      '- Completion criteria (tiêu chí hoàn thành)\n\n'
      'NGUYÊN TẮC:\n'
      '1. Chỉ lên kế hoạch cho các hành động trong phạm vi permissions hiện có.\n'
      '2. Rõ ràng về những gì cần approval.\n'
      '3. Ưu tiên hành động có rủi ro thấp và chi phí thấp.'
    ELSE 'System prompt for ' || context
  END
FROM public.system_prompts
ON CONFLICT DO NOTHING;
