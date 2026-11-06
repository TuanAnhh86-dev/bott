# Em Mì Incident Response

## Principles

- Protect users and stop external side effects first.
- Preserve evidence without copying secrets, tokens, private messages, payout details, or customer data into tickets or chat.
- Use a separate trusted administrator account and record timestamps in UTC.
- Do not deploy a fix or run a destructive migration directly in production without explicit administrator approval.

## Severity and response

| Severity | Examples | Immediate response |
|---|---|---|
| Critical | Service-role key exposure, confirmed unauthorized financial action, broad private-data exposure | Activate Emergency Stop if available, disable/rollback the affected Vercel deployment, revoke exposed credentials, notify the owner and provider |
| High | Admin account takeover, RLS policy exposure, repeated unauthorized mutations, exploitable application vulnerability | Pause worker execution, revoke affected sessions/keys, restrict deployment access, preserve relevant audit and provider logs |
| Medium | Cross-site mutation attempt, unusual AI usage, isolated account-level issue | Block the request path or account, review logs and rate limits, assess whether credentials need rotation |
| Low | Non-sensitive availability or configuration issue | Track, assign, and resolve through the normal change process |

## First-response procedure

1. Acknowledge the report and capture the UTC time, affected environment, route/resource, and reporter. Do not request passwords or secrets.
2. Stop agent work using the administrator Emergency Stop. If it is unavailable, disable the affected Vercel deployment or remove the worker/AI credentials from the production environment.
3. If an account or secret may be compromised, revoke sessions and rotate the relevant Supabase, AI, GitHub, or Vercel credential using its provider dashboard. Update production and preview independently.
4. Preserve Vercel, Supabase Auth/database, GitHub Actions, and AI-provider logs using access-controlled storage. Restrict access to incident responders.
5. Determine scope: exposed data, affected accounts, duration, executed tasks, provider calls, and whether legal or platform notification is required.
6. Fix through a reviewed branch and CI. Apply database changes only after backup, review, and explicit production approval.
7. Verify containment with anonymous, unauthorized-admin, RLS, and API regression tests. Restore service gradually and observe provider/database usage.
8. Document root cause, timeline, impact, actions, evidence locations, and follow-up owners without including secrets.

## Recovery

- Restore database data from a verified backup only after identifying the recovery point and expected data loss.
- Do not assume database restoration also restores Storage objects.
- Reapply reviewed migrations and verify them with [`supabase/verify_security.sql`](./supabase/verify_security.sql).
- Re-enable workers only after Emergency Stop, permissions, credentials, rate limits, and CI checks are verified.

## Communications

The project owner decides whether to notify affected users, Supabase/Vercel/AI providers, regulators, or law enforcement. Follow applicable legal requirements and provider incident procedures. Do not make public claims before facts are verified.

## Exercise status

No live incident-response drill or production restore was executed during this code change. The operator must assign an incident lead and perform a tabletop exercise before production readiness.
