# Em Mì database notes

The database is Supabase PostgreSQL. SQL changes are versioned in `supabase/migrations/`; apply the migrations in version order to the intended Supabase environment. This code change does not apply or verify migrations against a live Supabase project.

## Access model

`20261105003224_security_and_queue_hardening.sql` introduces broad private-table policies. The later `20261105_fix_rls_recursion.sql` contains legacy permissive policies and must not be treated as the final security state. `20261106000000_reassert_private_access.sql` is the latest policy migration: it replaces public-schema table policies, enables RLS, revokes browser-role grants, grants only profile self-read and active platform read to browser roles, and restricts application RPCs. The emergency-stop update and its audit event are written atomically through a service-role-only RPC.

`public.is_admin()` checks that the current authenticated user's profile is active and has role `admin` or `super_admin`. Server routes must still authenticate and authorize before using the service-role client, which bypasses RLS. Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code.

Application database access uses server-side services, so browser roles do not need access to private tables. The migration's policy/grant verification helper is [`supabase/verify_security.sql`](./supabase/verify_security.sql). Run it against each target project after migrations; static tests cannot verify live catalog state or Realtime configuration.

No Storage bucket/upload workflow exists in this application. Keep buckets private and do not expose Storage until separate object-level authorization and backup procedures are reviewed.

## Agent queue

- `tasks` stores execution state and cost fields.
- `task_dependencies` links a task to prerequisites. A task is claimable only after all prerequisites are `COMPLETED`.
- `public.claim_agent_tasks(max_tasks)` atomically claims eligible pending/queued tasks with row locking and is executable only by `service_role`.
- `agent_plan_steps` stores plan step descriptions and dependency numbers.
- The latest private-access migration adds requester/approver identities and server-only RPCs for task approvals. Approval binds to a SHA-256 hash of task type, title, description, and input data, expires after 24 hours, requires a different active `super_admin`, and is revalidated by the worker after claiming. Apply and verify this migration in a non-production database before relying on it.
- `task_events` stores execution history.
- Unknown actual costs remain `NULL`; an estimate is not recorded as actual spend.

## Revenue and KPI

Revenue and expense records are queried server-side. The public KPI endpoint exposes only the monthly aggregate returned by `KPIService`, not individual financial records. The default monthly target is 5,000,000 VND when no target row exists.

Use numeric database types for money. Do not treat estimates or pending payouts as verified revenue.

## Owner payout tracking

`20261105011823_owner_payouts.sql` adds owner-scoped payout destinations and withdrawal records. Destination account references are encrypted by the application before persistence; `PAYOUT_DATA_ENCRYPTION_KEY` is a server-only base64-encoded 32-byte key. `PAYOUT_OWNER_USER_ID` binds the feature to one active Supabase admin profile. The balance assumes all `revenue_records` rows marked `paid` belong to this single owner; it does not independently verify external payment evidence and is not suitable for multiple revenue owners without adding ownership to revenue records.

The database RPC serializes withdrawal requests per owner, limits withdrawals to revenue with status `paid`, reserves pending requests, supports idempotent retries, and writes audit records in the same transaction. Direct anon/authenticated table access and RPC calls are revoked; only server-side `service_role` can access the tables. The app records manual withdrawals and never sends funds.

## Apply and verify

1. Back up the target database and review every migration.
2. Apply migrations to development/preview first.
3. Run `supabase/verify_security.sql` and confirm no unexpected public grants, RLS gaps, anonymous RPCs, or public buckets/policies.
4. Verify administrator profile access, public platform reads, public KPI API behavior, and direct browser denial for private tables/RPCs.
5. Test Realtime subscriptions against the actual publication and policies if Realtime is enabled for any table.
6. Do not apply destructive schema or policy changes automatically to production; require owner approval and a verified backup.
