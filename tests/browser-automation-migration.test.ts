import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Browser Automation Multi-Agent Database Migration", () => {
  const migrationPath = path.resolve(process.cwd(), "supabase/migrations/20261109000000_browser_automation_multiagent.sql");

  it("migration file exists and is readable", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, "utf-8");
    expect(content.length).toBeGreaterThan(500);
  });

  it("contains all 5 core tables for real browser automation", () => {
    const content = fs.readFileSync(migrationPath, "utf-8");
    expect(content).toContain("CREATE TABLE IF NOT EXISTS public.bot_workers");
    expect(content).toContain("CREATE TABLE IF NOT EXISTS public.task_executions");
    expect(content).toContain("CREATE TABLE IF NOT EXISTS public.execution_events");
    expect(content).toContain("CREATE TABLE IF NOT EXISTS public.task_evidence");
    expect(content).toContain("CREATE TABLE IF NOT EXISTS public.human_approvals");
  });

  it("enforces Row Level Security (RLS) on all created tables", () => {
    const content = fs.readFileSync(migrationPath, "utf-8");
    expect(content).toContain("ALTER TABLE public.bot_workers ENABLE ROW LEVEL SECURITY;");
    expect(content).toContain("ALTER TABLE public.task_executions ENABLE ROW LEVEL SECURITY;");
    expect(content).toContain("ALTER TABLE public.execution_events ENABLE ROW LEVEL SECURITY;");
    expect(content).toContain("ALTER TABLE public.task_evidence ENABLE ROW LEVEL SECURITY;");
    expect(content).toContain("ALTER TABLE public.human_approvals ENABLE ROW LEVEL SECURITY;");
  });

  it("configures all necessary indexes for query performance", () => {
    const content = fs.readFileSync(migrationPath, "utf-8");
    expect(content).toContain("idx_bot_workers_status");
    expect(content).toContain("idx_task_executions_task");
    expect(content).toContain("idx_execution_events_time");
    expect(content).toContain("idx_task_evidence_task");
    expect(content).toContain("idx_human_approvals_status");
  });
});

