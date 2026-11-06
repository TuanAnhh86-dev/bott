-- Restrict direct API access to private application data. Server-side code
-- uses the service-role client only after verifying the user's Supabase session.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role IN ('admin', 'super_admin')
      AND is_active = TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

DO $$
DECLARE
  target_table RECORD;
  existing_policy RECORD;
BEGIN
  FOR target_table IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table.tablename);

    FOR existing_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = target_table.tablename
    LOOP
      EXECUTE format(
        'DROP POLICY %I ON public.%I',
        existing_policy.policyname,
        target_table.tablename
      );
    END LOOP;

    EXECUTE format(
      'CREATE POLICY admin_all ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
      target_table.tablename
    );
  END LOOP;
END;
$$;

CREATE POLICY profiles_self_read
ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY platforms_public_read
ON public.platforms
FOR SELECT TO anon, authenticated
USING (is_active = TRUE);

REVOKE ALL ON public.v_public_kpi, public.v_public_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_public_kpi, public.v_public_stats TO service_role;

CREATE INDEX IF NOT EXISTS idx_expenses_status_occurred_at
ON public.expenses(status, occurred_at);

ALTER TABLE public.tasks
  ALTER COLUMN actual_cost_vnd DROP DEFAULT;

UPDATE public.tasks
SET actual_cost_vnd = NULL
WHERE status <> 'COMPLETED';

CREATE TABLE IF NOT EXISTS public.task_dependencies (
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all
ON public.task_dependencies
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.claim_agent_tasks(max_tasks INTEGER)
RETURNS SETOF public.tasks
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH candidates AS (
    SELECT id
    FROM public.tasks
    WHERE status IN ('PENDING', 'QUEUED')
      AND NOT EXISTS (
        SELECT 1
        FROM public.task_dependencies AS dependency
        JOIN public.tasks AS prerequisite
          ON prerequisite.id = dependency.depends_on_task_id
        WHERE dependency.task_id = public.tasks.id
          AND prerequisite.status <> 'COMPLETED'
      )
    ORDER BY priority DESC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(max_tasks, 1), 1), 10)
  )
  UPDATE public.tasks AS task
  SET status = 'RUNNING',
      current_step = 'Claimed by worker',
      updated_at = NOW()
  FROM candidates
  WHERE task.id = candidates.id
  RETURNING task.*;
$$;

REVOKE ALL ON FUNCTION public.claim_agent_tasks(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_tasks(INTEGER) TO service_role;
