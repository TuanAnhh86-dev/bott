CREATE TABLE public.payout_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 100),
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 100),
  recipient_name TEXT NOT NULL CHECK (char_length(recipient_name) BETWEEN 1 AND 120),
  encrypted_account TEXT NOT NULL,
  masked_account TEXT NOT NULL CHECK (char_length(masked_account) BETWEEN 4 AND 12),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX payout_destinations_owner_active_idx
ON public.payout_destinations(owner_id, is_active, created_at DESC);

ALTER TABLE public.payout_destinations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payout_destinations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payout_destinations TO service_role;

CREATE TABLE public.payout_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  destination_id UUID NOT NULL REFERENCES public.payout_destinations(id) ON DELETE RESTRICT,
  amount_vnd NUMERIC(16, 2) NOT NULL CHECK (amount_vnd > 0),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'completed', 'cancelled')),
  idempotency_key UUID NOT NULL,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  completion_evidence TEXT CHECK (completion_evidence IS NULL OR char_length(completion_evidence) <= 1_000),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, idempotency_key)
);

CREATE INDEX payout_withdrawals_owner_status_idx
ON public.payout_withdrawals(owner_id, status, requested_at DESC);

ALTER TABLE public.payout_withdrawals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payout_withdrawals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payout_withdrawals TO service_role;

CREATE OR REPLACE FUNCTION public.get_owner_payout_balance(p_owner_id UUID)
RETURNS TABLE(paid_revenue_vnd NUMERIC, reserved_vnd NUMERIC, completed_vnd NUMERIC)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE((
      SELECT SUM(net_amount_vnd)
      FROM public.revenue_records
      WHERE status = 'paid'
    ), 0),
    COALESCE((
      SELECT SUM(amount_vnd)
      FROM public.payout_withdrawals
      WHERE owner_id = p_owner_id
        AND status = 'requested'
    ), 0),
    COALESCE((
      SELECT SUM(amount_vnd)
      FROM public.payout_withdrawals
      WHERE owner_id = p_owner_id
        AND status = 'completed'
    ), 0);
$$;

CREATE OR REPLACE FUNCTION public.create_payout_destination(
  p_owner_id UUID,
  p_provider TEXT,
  p_label TEXT,
  p_recipient_name TEXT,
  p_encrypted_account TEXT,
  p_masked_account TEXT
)
RETURNS public.payout_destinations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  created_destination public.payout_destinations;
BEGIN
  INSERT INTO public.payout_destinations (
    owner_id,
    provider,
    label,
    recipient_name,
    encrypted_account,
    masked_account
  )
  VALUES (
    p_owner_id,
    btrim(p_provider),
    btrim(p_label),
    btrim(p_recipient_name),
    p_encrypted_account,
    p_masked_account
  )
  RETURNING * INTO created_destination;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
  VALUES (
    p_owner_id,
    'owner',
    'PAYOUT_DESTINATION_CREATED',
    'payout_destination',
    created_destination.id::TEXT,
    jsonb_build_object('provider', created_destination.provider, 'masked_account', created_destination.masked_account)
  );

  RETURN created_destination;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_manual_payout_withdrawal(
  p_owner_id UUID,
  p_destination_id UUID,
  p_amount_vnd NUMERIC,
  p_idempotency_key UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS public.payout_withdrawals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  existing_request public.payout_withdrawals;
  created_request public.payout_withdrawals;
  paid_balance NUMERIC(16, 2);
  reserved_balance NUMERIC(16, 2);
BEGIN
  IF p_amount_vnd IS NULL OR p_amount_vnd <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_amount';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_owner_id::TEXT));

  SELECT *
  INTO existing_request
  FROM public.payout_withdrawals
  WHERE owner_id = p_owner_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN existing_request;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payout_destinations
    WHERE id = p_destination_id
      AND owner_id = p_owner_id
      AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_destination';
  END IF;

  SELECT COALESCE(SUM(net_amount_vnd), 0)
  INTO paid_balance
  FROM public.revenue_records
  WHERE status = 'paid';

  SELECT COALESCE(SUM(amount_vnd), 0)
  INTO reserved_balance
  FROM public.payout_withdrawals
  WHERE owner_id = p_owner_id
    AND status IN ('requested', 'completed');

  IF p_amount_vnd + reserved_balance > paid_balance THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'insufficient_paid_balance';
  END IF;

  INSERT INTO public.payout_withdrawals (
    owner_id,
    destination_id,
    amount_vnd,
    idempotency_key,
    note
  )
  VALUES (
    p_owner_id,
    p_destination_id,
    p_amount_vnd,
    p_idempotency_key,
    NULLIF(p_note, '')
  )
  RETURNING * INTO created_request;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
  VALUES (
    p_owner_id,
    'owner',
    'PAYOUT_WITHDRAWAL_REQUESTED',
    'payout_withdrawal',
    created_request.id::TEXT,
    jsonb_build_object(
      'amount_vnd', created_request.amount_vnd,
      'destination_id', created_request.destination_id,
      'status', created_request.status
    )
  );

  RETURN created_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_manual_payout_withdrawal(
  p_owner_id UUID,
  p_withdrawal_id UUID,
  p_completion_evidence TEXT
)
RETURNS public.payout_withdrawals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated_request public.payout_withdrawals;
BEGIN
  IF p_completion_evidence IS NULL OR char_length(btrim(p_completion_evidence)) < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'completion_evidence_required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_owner_id::TEXT));

  UPDATE public.payout_withdrawals
  SET status = 'completed',
      completion_evidence = left(btrim(p_completion_evidence), 1000),
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_withdrawal_id
    AND owner_id = p_owner_id
    AND status = 'requested'
  RETURNING * INTO updated_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'withdrawal_not_pending';
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
  VALUES (
    p_owner_id,
    'owner',
    'PAYOUT_WITHDRAWAL_MANUALLY_CONFIRMED',
    'payout_withdrawal',
    updated_request.id::TEXT,
    jsonb_build_object('amount_vnd', updated_request.amount_vnd, 'status', updated_request.status)
  );

  RETURN updated_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_manual_payout_withdrawal(
  p_owner_id UUID,
  p_withdrawal_id UUID
)
RETURNS public.payout_withdrawals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated_request public.payout_withdrawals;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_owner_id::TEXT));

  UPDATE public.payout_withdrawals
  SET status = 'cancelled',
      updated_at = NOW()
  WHERE id = p_withdrawal_id
    AND owner_id = p_owner_id
    AND status = 'requested'
  RETURNING * INTO updated_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'withdrawal_not_pending';
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
  VALUES (
    p_owner_id,
    'owner',
    'PAYOUT_WITHDRAWAL_CANCELLED',
    'payout_withdrawal',
    updated_request.id::TEXT,
    jsonb_build_object('amount_vnd', updated_request.amount_vnd, 'status', updated_request.status)
  );

  RETURN updated_request;
END;
$$;

REVOKE ALL ON FUNCTION public.create_payout_destination(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_owner_payout_balance(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_manual_payout_withdrawal(UUID, UUID, NUMERIC, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_manual_payout_withdrawal(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_manual_payout_withdrawal(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_manual_payout_withdrawal(UUID, UUID, NUMERIC, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_payout_destination(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_payout_balance(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_manual_payout_withdrawal(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_manual_payout_withdrawal(UUID, UUID) TO service_role;
