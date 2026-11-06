export type UserRole = "super_admin" | "admin" | "viewer";

export type ActionCategory = 
  | "AUTO_EXECUTE"
  | "AUTO_EXECUTE_WITH_LIMITS"
  | "REQUIRE_APPROVAL"
  | "FORBIDDEN";

export type AutonomyLevel = "OFF" | "SEMI" | "AUTO";

export type TaskStatus = 
  | "PENDING"
  | "PLANNING"
  | "QUEUED"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "PAUSED";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type RevenueStatus = 
  | "estimated"
  | "pending"
  | "verified"
  | "paid"
  | "cancelled"
  | "refunded";

export type PlatformCategory = 
  | "subscription_ppv"
  | "stock_media"
  | "ugc_brand"
  | "digital_products"
  | "clipping"
  | "affiliate"
  | "other";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: string;
  name: string;
  category: string;
  description: string | null;
  action_category: ActionCategory;
  is_mutable: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  plan_id?: string | null;
  task_type: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: number;
  input_data: Record<string, unknown>;
  current_step?: string | null;
  progress?: number | null;
  assigned_worker?: string | null;
  assigned_worker_name?: string | null;
  retry_count: number;
  max_retries: number;
  estimated_cost_vnd: number;
  actual_cost_vnd: number | null;
  required_permission?: string | null;
  approval_status?: "not_required" | "pending" | "approved" | "rejected" | null;
  result?: Record<string, unknown> | null;
  error_details?: string | null;
  idempotency_key?: string | null;
  timeout_at?: string | null;
  created_by?: string | null;
  approved_by?: string | null;
  approval_payload_hash?: string | null;
  approval_expires_at?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface AgentPlan {
  id: string;
  objective: string;
  status: "draft" | "active" | "completed" | "cancelled" | "failed";
  priority: number;
  estimated_cost_vnd: number;
  actual_cost_vnd: number;
  expected_result?: string | null;
  risks?: string | null;
  required_permissions: string[];
  completion_criteria?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface ApprovalRequest {
  id: string;
  action_id: string;
  actor_id?: string | null;
  action_type: string;
  target: string;
  payload: Record<string, unknown>;
  payload_hash: string;
  risk_level: RiskLevel;
  estimated_cost_vnd: number;
  status: "pending" | "approved" | "rejected" | "expired" | "executed";
  approver_id?: string | null;
  approver_note?: string | null;
  expires_at: string;
  executed_at?: string | null;
  execution_result?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface RevenueRecord {
  id: string;
  platform_id?: string | null;
  business_model_id?: string | null;
  campaign_id?: string | null;
  product_id?: string | null;
  revenue_type: "subscription" | "ppv" | "royalty" | "commission" | "sale" | "tip" | "affiliate" | "other";
  status: RevenueStatus;
  gross_amount_vnd: number;
  platform_fee_vnd: number;
  net_amount_vnd: number;
  currency_original?: string | null;
  amount_original?: number | null;
  exchange_rate?: number | null;
  evidence?: string | null;
  verification_method?: string | null;
  verified_at?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MonthlyKPI {
  id: string;
  year: number;
  month: number;
  target_vnd: number;
  actual_gross_vnd: number;
  actual_net_vnd: number;
  total_expenses_vnd: number;
  net_profit_vnd: number;
  completion_pct: number;
  status: "active" | "closed" | "adjusted";
  notes?: string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Platform {
  id: string;
  name: string;
  slug: string;
  category: PlatformCategory;
  website_url?: string | null;
  api_docs_url?: string | null;
  integration_status: "not_integrated" | "manual" | "api" | "oauth";
  is_active: boolean;
  metadata?: Record<string, unknown>;
  verified_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  session_id: string;
  type: "public" | "admin";
  user_id?: string | null;
  anonymous_id?: string | null;
  title?: string | null;
  summary?: string | null;
  message_count: number;
  is_active: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokens_input?: number;
  tokens_output?: number;
  tokens_cached?: number;
  model_used?: string | null;
  cost_usd?: number;
  cost_vnd?: number;
  metadata?: Record<string, unknown>;
  is_moderated?: boolean;
  moderation_reason?: string | null;
  created_at: string;
}
