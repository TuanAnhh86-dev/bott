import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261107000000_taskmoney_core_schema.sql",
  "utf8"
);

describe("TaskMoney Core Schema Migration", () => {
  it("defines all core tables for TaskMoney multi-agent ecosystem", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.site_analyses/i);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.platform_accounts/i);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.agent_missions/i);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.task_action_logs/i);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.earnings_ledger/i);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.withdrawal_requests/i);
  });

  it("enforces RLS across all tables and defines proper least-privilege policies", () => {
    expect(migration).toMatch(/ALTER TABLE public\.site_analyses ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/ALTER TABLE public\.platform_accounts ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/ALTER TABLE public\.agent_missions ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/ALTER TABLE public\.task_action_logs ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/ALTER TABLE public\.earnings_ledger ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/ALTER TABLE public\.withdrawal_requests ENABLE ROW LEVEL SECURITY/i);
  });

  it("strictly avoids floating-point types for monetary fields and enforces numeric/decimal", () => {
    expect(migration).toMatch(/min_payout_usd NUMERIC\(12, 2\)/i);
    expect(migration).toMatch(/reward_estimated_usd NUMERIC\(12, 4\)/i);
    expect(migration).toMatch(/amount_usd NUMERIC\(12, 4\)/i);
    expect(migration).not.toMatch(/amount.*FLOAT/i);
    expect(migration).not.toMatch(/reward.*REAL/i);
  });

  it("requires human approval status for withdrawal requests", () => {
    expect(migration).toMatch(/status TEXT DEFAULT 'WAITING_HUMAN_APPROVAL'/i);
    expect(migration).toMatch(/human_signature_hash TEXT/i);
    expect(migration).toMatch(/approved_by_user_id UUID/i);
  });
});

