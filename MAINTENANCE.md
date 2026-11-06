# Em Mì Maintenance Runbook

## Backups and restore

### Database

1. In the Supabase dashboard, check **Database → Backups** and confirm the configured backup schedule, retention, and project plan. Do not assume point-in-time recovery is available.
2. Before each migration, export a database backup using a Supabase-supported method for the current plan and retain it encrypted in an access-controlled location separate from this repository.
3. Record the backup timestamp, project reference, schema migration version, and operator. Never put the database URL, password, or backup file in GitHub Actions logs or artifacts.
4. On a scheduled exercise, restore the backup into a separate non-production Supabase project. Apply only the reviewed migrations needed to reproduce the intended schema.
5. Run [`supabase/verify_security.sql`](./supabase/verify_security.sql), authenticate a test admin, and test the public/admin APIs before marking the backup restorable.

### Storage

There are no application upload routes or configured application storage buckets in this repository. Do not enable a public bucket to work around this limitation. If Storage is introduced, define private bucket policies and an object backup/export process before accepting user files. Database backups do not establish that object data is backed up.

### Restore acceptance record

No restore exercise has been run or independently verified for this workspace. Production readiness requires an operator to record the restore date, source backup, destination project, migration version, verification results, and any recovery gaps here or in the organization's protected operations log.

## Daily checks

- Check Vercel deployment health and `/api/health` (HTTP 200 means the application can reach `app_settings` in Supabase; it does not verify AI providers or every database feature).
- Review application error rates and Supabase availability/usage; alert on repeated 5xx, authentication failures, and database connection errors.
- Confirm Emergency Stop state and investigate any unexpected changes.
- Review current AI/provider consumption against vendor dashboards; this application does not enforce a durable monetary budget.

## Weekly checks

- Review GitHub Actions for failed CI, dependency audit findings, and secret-scan alerts.
- Inspect Supabase Auth administrators, active profile roles, RLS/grants, and Storage buckets/policies.
- Review audit log entries and task failures/retries for unexpected activity.
- Confirm preview and production environment scopes remain separate and no preview deployment has production credentials.

## Monthly checks

- Review and update dependencies in a dedicated pull request; run the full CI gate.
- Verify backup retention and perform a restore exercise in an isolated project.
- Review Vercel/Supabase/AI provider costs and quotas, rotate credentials according to organizational policy, and remove unused keys.
- Review admin users, GitHub branch protection, Actions permissions, and Vercel access.
- Re-test anonymous admin access, RLS denial, CSRF, Emergency Stop, and payout owner isolation.

## Operational limits

- The in-memory rate limiter, worker state, and runtime-added AI keys are per-process and do not coordinate across Vercel instances.
- `/api/health` checks application-to-database connectivity only.
- An Emergency Stop prevents new work but does not abort an already-started provider request.
- No production backup, restore, monitoring integration, or spend-budget enforcement is claimed until independently configured and tested.
