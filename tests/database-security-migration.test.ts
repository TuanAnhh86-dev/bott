import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261106000000_reassert_private_access.sql",
  "utf8"
);

describe("Database access hardening migration", () => {
  it("removes broad browser grants and re-enables RLS across public tables", () => {
    expect(migration).toMatch(/REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/CREATE POLICY admin_all ON public\.%I FOR ALL TO authenticated USING \(public\.is_admin\(\)\) WITH CHECK \(public\.is_admin\(\)\)/i);
  });

  it("limits anonymous table access to active platform records", () => {
    expect(migration).toMatch(/GRANT SELECT ON public\.platforms TO anon, authenticated/i);
    expect(migration).toMatch(/CREATE POLICY platforms_public_read[\s\S]*?FOR SELECT TO anon, authenticated[\s\S]*?USING \(is_active = TRUE\)/i);
    expect(migration).not.toMatch(/CREATE POLICY[^;]+TO anon[^;]+USING\s*\(\s*TRUE\s*\)/i);
    expect(migration).not.toMatch(/CREATE POLICY[^;]+USING\s*\(\s*auth\.uid\(\)\s+IS\s+NULL\s*\)/i);
  });

  it("revokes public function execution and keeps privileged operations service-role only", () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_agent_tasks\(INTEGER\) TO service_role/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.request_manual_payout_withdrawal\([\s\S]*?TO service_role/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.set_agent_emergency_stop\([\s\S]*?INSERT INTO public\.audit_logs[\s\S]*?ON CONFLICT \(key\) DO UPDATE/i);
  });
});
