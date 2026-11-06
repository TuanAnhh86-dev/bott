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

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approval_payload_hash TEXT,
  ADD COLUMN IF NOT EXISTS approval_expires_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.request_task_approval(p_task_id UUID)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_task public.tasks;
  payload_hash TEXT;
  updated_task public.tasks;
BEGIN
  SELECT *
  INTO current_task
  FROM public.tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND OR current_task.created_by IS NULL OR current_task.status NOT IN ('RUNNING', 'WAITING_APPROVAL') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_not_eligible_for_approval';
  END IF;

  payload_hash := encode(digest(jsonb_build_object(
    'task_type', current_task.task_type,
    'title', current_task.title,
    'description', current_task.description,
    'input_data', COALESCE(current_task.input_data, '{}'::JSONB)
  )::TEXT, 'sha256'), 'hex');

  IF current_task.status = 'WAITING_APPROVAL'
    AND current_task.approval_status = 'pending'
    AND current_task.approval_payload_hash = payload_hash
    AND current_task.approval_expires_at > NOW() THEN
    RETURN current_task;
  END IF;

  UPDATE public.tasks
  SET status = 'WAITING_APPROVAL',
      approval_status = 'pending',
      approved_by = NULL,
      approval_payload_hash = payload_hash,
      approval_expires_at = NOW() + INTERVAL '24 hours',
      current_step = 'Waiting for separate administrator approval',
      updated_at = NOW()
  WHERE id = p_task_id
  RETURNING * INTO updated_task;

  INSERT INTO public.task_events (task_id, event_type, previous_status, new_status, data)
  VALUES (
    p_task_id,
    'APPROVAL_REQUESTED',
    current_task.status,
    updated_task.status,
    jsonb_build_object('action_type', current_task.task_type, 'payload_hash', payload_hash)
  );

  RETURN updated_task;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_agent_task(p_task_id UUID, p_approver_id UUID)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_task public.tasks;
  approver_role TEXT;
  current_hash TEXT;
  approved_task public.tasks;
BEGIN
  SELECT role
  INTO approver_role
  FROM public.profiles
  WHERE id = p_approver_id
    AND is_active = TRUE
    AND role = 'super_admin';

  IF approver_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active_super_admin_required';
  END IF;

  SELECT *
  INTO current_task
  FROM public.tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND
    OR current_task.status <> 'WAITING_APPROVAL'
    OR current_task.approval_status <> 'pending'
    OR current_task.created_by IS NULL
    OR current_task.created_by = p_approver_id
    OR current_task.approval_expires_at IS NULL
    OR current_task.approval_expires_at <= NOW() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_approval_invalid_or_expired';
  END IF;

  current_hash := encode(digest(jsonb_build_object(
    'task_type', current_task.task_type,
    'title', current_task.title,
    'description', current_task.description,
    'input_data', COALESCE(current_task.input_data, '{}'::JSONB)
  )::TEXT, 'sha256'), 'hex');

  IF current_hash IS DISTINCT FROM current_task.approval_payload_hash THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_approval_payload_changed';
  END IF;

  UPDATE public.tasks
  SET status = 'QUEUED',
      approval_status = 'approved',
      approved_by = p_approver_id,
      current_step = 'Approved by a separate super administrator',
      updated_at = NOW()
  WHERE id = p_task_id
  RETURNING * INTO approved_task;

  INSERT INTO public.task_events (task_id, event_type, previous_status, new_status, data)
  VALUES (
    p_task_id,
    'APPROVAL_GRANTED',
    current_task.status,
    approved_task.status,
    jsonb_build_object('approver_id', p_approver_id, 'payload_hash', current_hash)
  );

  INSERT INTO public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
  VALUES (
    p_approver_id,
    approver_role,
    'TASK_APPROVAL_GRANTED',
    'task',
    p_task_id::TEXT,
    jsonb_build_object('payload_hash', current_hash)
  );

  RETURN approved_task;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_task_approval_valid(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks AS task
    JOIN public.profiles AS approver
      ON approver.id = task.approved_by
     AND approver.is_active = TRUE
     AND approver.role = 'super_admin'
    WHERE task.id = p_task_id
      AND task.status = 'RUNNING'
      AND task.approval_status = 'approved'
      AND task.approved_by IS DISTINCT FROM task.created_by
      AND task.approval_expires_at > NOW()
      AND task.approval_payload_hash = encode(digest(jsonb_build_object(
        'task_type', task.task_type,
        'title', task.title,
        'description', task.description,
        'input_data', COALESCE(task.input_data, '{}'::JSONB)
      )::TEXT, 'sha256'), 'hex')
  );
$$;

CREATE OR REPLACE FUNCTION public.set_agent_emergency_stop(
  p_active BOOLEAN,
  p_actor_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role TEXT;
BEGIN
  SELECT role
  INTO actor_role
  FROM public.profiles
  WHERE id = p_actor_id
    AND is_active = TRUE
    AND role IN ('admin', 'super_admin');

  IF actor_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active_admin_required';
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
  VALUES (
    p_actor_id,
    actor_role,
    CASE WHEN p_active THEN 'EMERGENCY_STOP_ACTIVATED' ELSE 'EMERGENCY_STOP_DEACTIVATED' END,
    'system',
    'agent.emergency_stop',
    jsonb_build_object('active', p_active, 'timestamp', NOW())
  );

  INSERT INTO public.app_settings (key, value, description, updated_by, updated_at)
  VALUES (
    'agent.emergency_stop',
    to_jsonb(p_active),
    CASE WHEN p_active THEN 'Emergency Stop active' ELSE 'Emergency Stop inactive' END,
    p_actor_id,
    NOW()
  )
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_by = EXCLUDED.updated_by,
      updated_at = EXCLUDED.updated_at;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

DO $$
DECLARE
  target_table RECORD;
  target_policy RECORD;
  target_function RECORD;
BEGIN
  FOR target_table IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table.tablename);

    FOR target_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = target_table.tablename
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', target_policy.policyname, target_table.tablename);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY admin_all ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
      target_table.tablename
    );
  END LOOP;

  FOR target_function IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', target_function.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', target_function.signature);
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

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.platforms TO anon, authenticated;
REVOKE ALL ON public.v_public_kpi, public.v_public_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_public_kpi, public.v_public_stats TO service_role;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_agent_emergency_stop(BOOLEAN, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_agent_emergency_stop(BOOLEAN, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.request_task_approval(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_agent_task(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_task_approval_valid(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_task_approval(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_agent_task(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_task_approval_valid(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_agent_tasks(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_payout_destination(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_payout_balance(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_manual_payout_withdrawal(UUID, UUID, NUMERIC, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_manual_payout_withdrawal(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_manual_payout_withdrawal(UUID, UUID) TO service_role;
