# Em Mì Deployment Checklist

## Before every deployment

- [ ] Confirm the target is development, Preview, or Production; use the matching Supabase and AI credentials.
- [ ] Review the diff, SQL migrations, generated types, and security-sensitive configuration.
- [ ] Confirm no `.env*`, backup, production data, or provider credentials are tracked.
- [ ] Pass `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm audit --prod --audit-level high`, the secret scan, and `pnpm build`.
- [ ] Apply reviewed migrations in a non-production project and run [`supabase/verify_security.sql`](./supabase/verify_security.sql).
- [ ] Test login/logout, anonymous `/admin` denial, inactive and viewer profile denial, CSRF denial, public KPI disclosure, task permission checks, Emergency Stop, and payout owner isolation.
- [ ] Confirm no upload bucket is public. This repository does not implement file uploads or Storage access.
- [ ] Verify the production backup schedule and latest successful restore exercise. A backup indicator alone is not proof of restorability.
- [ ] Review the Vercel Preview build and its response headers/CSP.

## GitHub administrator setup (manual)

1. Protect `main` and `develop`; require pull requests and dismiss stale approvals after new commits.
2. Require the `Typecheck, lint, and tests`, `Dependency audit and secret scan`, and `Production build` checks for merges to `main`.
3. Restrict who can bypass required checks; disable force pushes and deletion on protected branches.
4. Enable GitHub secret scanning and push protection if available for the repository plan. The workflow secret scanner supplements, but does not replace, provider-side protection.
5. Grant GitHub Actions only read access by default. Review any future workflow that requests write permissions or uses deployment secrets.

## Vercel administrator setup (manual)

1. Add separate Development, Preview, and Production environment values. Production `SUPABASE_SERVICE_ROLE_KEY`, AI keys, payout owner ID, and encryption key must never be copied into untrusted Preview deployments.
2. Disable access to Production deployments for untrusted collaborators and protect Preview deployments where the plan supports it.
3. Configure the Git integration to deploy production only from the approved `main` branch after required GitHub checks. Do not add a workflow that bypasses repository branch protection.
4. Ensure the custom domain uses HTTPS. Review the emitted CSP against the configured Supabase origin and required app assets.
5. Configure monitoring/alerts for failed deployments, 5xx responses, and usage/cost thresholds using capabilities available on the current Vercel plan.
6. Confirm the `/api/health` endpoint reports database reachability after deployment. It does not validate AI provider availability, RLS policy correctness, or backup health.

## Database release gate

1. Confirm a backup exists and the latest restore test is documented.
2. Review migration order and destructive effects.
3. Apply migrations to Preview/non-production first; run the SQL verification script and application tests.
4. Obtain explicit owner approval before applying any production migration.
5. Apply the same reviewed migration to Production using the Supabase dashboard/approved migration process; record the migration version and operator.
6. Run post-migration smoke tests and verify anonymous/browser roles cannot access private tables or RPCs.

## Rollback

1. Stop or disable workers and confirm Emergency Stop state.
2. Roll back the Vercel application to the last known-good deployment using the Vercel dashboard.
3. Do not automatically reverse database migrations. Prefer a reviewed forward fix; restore a database backup only with owner approval and an understood recovery point/data-loss window.
4. Re-run health, auth, RLS, and security regression checks before re-enabling traffic or workers.
5. Record the deployment IDs, migration versions, operator, reason, and verification results.

## Current release blockers

- The new RLS/grant migration has not been applied to a live Supabase project or verified against its actual catalog.
- GitHub branch protection and Vercel environment scopes are dashboard settings and have not been verified.
- No production backup/restore test has been performed.
- Distributed rate limiting, enforceable monetary AI budgets, and durable cross-instance workers are not implemented.
- No platform publishing integration or file-upload/Storage workflow is implemented.
