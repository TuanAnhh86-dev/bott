# Em Mì

Em Mì is a Vietnamese AI business assistant built with Next.js App Router, Supabase, and the Google Gemini provider. It supports public chat, verified monthly KPI reporting, admin task management, web research, and guarded task execution. Business-platform adapters are not connected to real platform APIs.

## Requirements

- Node.js 20+
- pnpm 12+
- A Supabase project
- A Google Gemini API key for AI features

## Local setup

```powershell
pnpm install
Copy-Item .env.example .env.local
```

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Keep the service-role key server-side. Configure `AI_API_KEY` or `AI_API_KEYS` for persistent AI credentials.

For owner-only payout tracking, also set `PAYOUT_OWNER_USER_ID` to the UUID of the verified admin profile and `PAYOUT_DATA_ENCRYPTION_KEY` to a base64-encoded 32-byte random key. Generate a key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Back up this key securely; losing it makes saved payout account details unreadable. Never commit the real key.

Apply the SQL files in `supabase/migrations/` in version order. Create an administrator in Supabase Auth and add or update the matching `public.profiles` row with an active `admin` or `super_admin` role. Admin routes do not provide an unauthenticated development bypass. After migrations, run [`supabase/verify_security.sql`](./supabase/verify_security.sql) against the target database; CI checks migration invariants statically but cannot verify the live project.

Then run:

```powershell
pnpm dev
```

Open `http://localhost:3000`; sign in at `/login` to access `/admin`.

## Checks

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm audit --prod --audit-level high
pnpm build
```

`/api/health` reports whether the application can reach the Supabase settings table. It does not verify AI provider health, live RLS, or backups. Production deployment is intentionally not automated; configure GitHub required checks and Vercel environment separation using [`DEPLOYMENT-CHECKLIST.md`](./DEPLOYMENT-CHECKLIST.md).

## Operational limitations

- API keys entered through the admin UI exist only in the current server process. Configure environment variables for persistence and consistency across serverless instances.
- Chat rate limits and worker state are process-local; they are not distributed across Vercel instances.
- Admin mutation APIs require same-origin JSON requests and enforce process-local request limits. These limits are defense-in-depth and are not a distributed spending control.
- Emergency Stop prevents new task execution. It does not abort an external request already in progress.
- Web-search citations are unverified search results. Verify important claims against the cited source.
- Platform adapters do not read accounts, analytics, revenue, or publish content. No platform integration should be presented as active.
- Payout tracking is manual. Only the configured owner can access it; the app encrypts saved destination details and tracks holds against revenue marked `paid`. It never transfers money. The owner must execute the transfer outside the app and then record evidence.
- AI cost budgets, distributed queues, automatic revenue reconciliation, and durable approval execution are not implemented.
- No file upload or Supabase Storage workflow exists. Keep Storage disabled until private access policies, validation, backups, and tests are implemented.
