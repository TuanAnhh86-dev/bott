# Em Mì Security Review and Controls

**Review date:** 2026-11-05  
**Framework verified:** Next.js 16.4.4; relevant installed headers, Proxy, and CSP documentation was reviewed under `node_modules/next/dist/docs/`.

## Security architecture

- **Authentication:** Server routes and the admin layout verify the Supabase session with `auth.getUser()` and read the active role from `public.profiles` using a server-only service client. A JWT/client-supplied role is not used as authorization.
- **Authorization:** `admin` and `super_admin` can access the admin area. Pool key changes, worker start, task approval, and Emergency Stop deactivation require `super_admin`. Payout API additionally matches the authenticated user to the configured owner UUID.
- **Public/private isolation:** Public chat and the public KPI aggregate have separate endpoints. Admin endpoints require server authorization. Public KPI values are intentionally disclosed at aggregate level; individual revenue and payout records are not returned by the public route.
- **Request protection:** State-changing JSON endpoints reject missing or cross-origin `Origin`, reject simple content types, bound request bodies, validate payloads with Zod, and apply per-process rate limits.
- **Browser protection:** `proxy.ts` issues a per-request CSP nonce for page responses. Global headers include `nosniff`, frame denial, a strict referrer policy, and a restrictive Permissions Policy. API responses use a no-store policy and API CSP.
- **Database:** `public.is_admin()` uses active database profile state. The latest migration re-enables RLS, revokes browser-role table/sequence/function grants, limits anonymous table access to active platforms, and retains service-role access for server-only handlers. `supabase/verify_security.sql` is provided to inspect the live database and Storage catalog.
- **AI/tasks:** Permission evaluation fails closed on unknown/database-unavailable policy checks; the task claim RPC uses row locking and `SKIP LOCKED`; task execution has retry limits and checks the global Emergency Stop before execution. Emergency Stop setting and audit changes are performed by one database RPC transaction.
- **Secrets:** `.env*` is ignored except `.env.example`. `SUPABASE_SERVICE_ROLE_KEY` must remain server-only. Browser Supabase clients use only the public URL and anon/publishable key.
- **File handling:** No application upload route, file processor, or Storage integration exists. No public bucket should be enabled for this application.

## Findings and remediation status

| Risk | Finding | Status / evidence |
|---|---|---|
| MEDIUM | Admin task/worker and other mutation endpoints lacked consistent CSRF/origin enforcement. A hostile same-site subdomain could potentially trigger authenticated state changes. | **Fixed in code:** shared same-origin and JSON guards are applied to all POST API routes; route/helper regression tests cover cross-origin and text/plain requests. |
| HIGH deployment blocker | Database migrations have not been applied or verified against a live Supabase project. Local SQL review cannot prove the live grants, policies, Storage buckets, or Realtime configuration. | **Open manual step:** apply the reviewed migrations to a non-production project, run `supabase/verify_security.sql`, and verify access tests before production. |
| MEDIUM | Rate limiting and worker/key state are in process memory; Vercel instances do not share counters/state. | **Open:** use a durable shared limiter/queue before relying on limits for production abuse or cost control. Current endpoint limits are defense-in-depth only. |
| HIGH | No durable monetary AI budget gate or reliable cost accounting is wired into provider execution; per-route/per-process request limits do not bound spend across instances. | **Open production blocker:** implement provider usage persistence and atomic budget reservation before enabling autonomous AI execution at scale. |
| MEDIUM | Emergency Stop prevents new work but does not cancel a provider request already in flight. | **Open:** provider calls should be abortable and task state reconciled on cancellation/timeout. |
| HIGH deployment blocker | Task approvals must not be trusted until the new approval migration is applied and verified on the target database. | **Code implemented; live verification open:** approval requests hash the task type/title/description/input, expire after 24 hours, require a different active `super_admin`, and are revalidated against the unchanged payload immediately before execution. Unit tests cover self-approval, changed payloads, and expiry. The SQL functions and grants still require application and verification on a non-production Supabase project. |
| MEDIUM | No platform publishing adapter or capability validation exists. | No publishing action is implemented; do not treat platform records or AI output as evidence of integration or publication. |
| MEDIUM | No file upload/storage workflow is implemented; actual project bucket policies cannot be assessed without the deployed Supabase catalog. | Keep Storage disabled for this app until private bucket policies, file validation, signed access, and object backup are implemented and tested. |
| HIGH operations | GitHub branch protection, Vercel environment scoping, monitoring, and database restore have not been verified/configured for a live deployment. | Follow [`DEPLOYMENT-CHECKLIST.md`](./DEPLOYMENT-CHECKLIST.md); no deployment or restore is claimed. |

## Verification evidence

- `package.json` specifies Next.js `16.4.4`; local documentation for the installed version was used for CSP/Proxy/header implementation.
- Unit tests cover rejection of unauthenticated admin access, rejection of a forged role claim against the profile record, owner-only payout access, cross-origin mutation rejection, body-size limits, Emergency Stop RPC behavior, payload-bound task approval checks, and static assertions for the database hardening migration.
- Production build, typecheck, lint, dependency audit, and tests must be run and recorded for the current change before release. Static SQL tests are not a substitute for applying SQL to Postgres.
- `supabase/verify_security.sql` checks live catalog state, but it has not been run against the target Supabase environment.

## Deployment and incident response

Use [`DEPLOYMENT-CHECKLIST.md`](./DEPLOYMENT-CHECKLIST.md), [`MAINTENANCE.md`](./MAINTENANCE.md), and [`INCIDENT-RESPONSE.md`](./INCIDENT-RESPONSE.md). CI does not deploy to Production. Configure required GitHub checks and Vercel Production/Preview environment separation manually.

## Security contact and secret handling

Do not include credentials or personal data in issues, logs, or test fixtures. Report suspected compromise privately to the project owner. Rotate exposed credentials in their provider dashboards and separately for Preview and Production.
