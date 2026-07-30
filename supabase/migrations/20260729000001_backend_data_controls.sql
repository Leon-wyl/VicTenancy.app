-- Migration: Backend Data Controls (Step 14c)
-- Creates request_quota_counters table with atomic consumption function.
-- Enables RLS on the counter table with no browser-access grants.
-- Function is SECURITY INVOKER; only the API service account (direct postgres
-- connection) can execute it. Browser roles (anon, authenticated) cannot.

-- =============================================================================
-- 1. Request quota counters table
-- =============================================================================

CREATE TABLE request_quota_counters (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  window_kind  TEXT NOT NULL CHECK (window_kind IN ('minute', 'day')),
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, window_kind, window_start)
);

CREATE TRIGGER trg_request_quota_counters_updated_at
  BEFORE UPDATE ON request_quota_counters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE request_quota_counters ENABLE ROW LEVEL SECURITY;

-- Revoke browser access: anon/authenticated cannot read or write counter rows
-- and cannot call the consumption function.
REVOKE ALL ON TABLE request_quota_counters FROM anon, authenticated;

-- =============================================================================
-- 2. Atomic quota consumption function (SECURITY INVOKER)
-- =============================================================================

CREATE OR REPLACE FUNCTION check_and_increment_quota(
    p_user_id UUID,
    p_max_per_minute INT,
    p_max_per_day INT
) RETURNS TABLE(
    allowed             BOOLEAN,
    minute_count        INT,
    day_count           INT,
    retry_after_seconds INT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_minute_window TIMESTAMPTZ;
    v_day_window    TIMESTAMPTZ;
    v_minute_count  INT;
    v_day_count     INT;
    v_minute_retry  INT;
    v_day_retry     INT;
    v_lock_key      BIGINT;
BEGIN
    -- Ensure inputs are non-null before hashing
    v_lock_key := hashtext(p_user_id::text);

    -- Transaction-scoped advisory lock (auto-released on commit/rollback).
    -- Ensures all-or-nothing atomicity for both windows.
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- Calculate current UTC window boundaries.
    v_minute_window := date_trunc('minute', timezone('UTC', now())) AT TIME ZONE 'UTC';
    v_day_window    := date_trunc('day', timezone('UTC', now())) AT TIME ZONE 'UTC';

    -- Stale cleanup: remove counters from previous windows for this user.
    -- Keeps at most 2 rows per active user (current minute + current day).
    DELETE FROM public.request_quota_counters
    WHERE user_id = p_user_id
      AND window_kind = 'minute'
      AND window_start < v_minute_window;

    DELETE FROM public.request_quota_counters
    WHERE user_id = p_user_id
      AND window_kind = 'day'
      AND window_start < v_day_window;

    -- Ensure current-window counter rows exist.
    INSERT INTO public.request_quota_counters (user_id, window_kind, window_start, count)
    VALUES (p_user_id, 'minute', v_minute_window, 0)
    ON CONFLICT (user_id, window_kind, window_start) DO NOTHING;

    INSERT INTO public.request_quota_counters (user_id, window_kind, window_start, count)
    VALUES (p_user_id, 'day', v_day_window, 0)
    ON CONFLICT (user_id, window_kind, window_start) DO NOTHING;

    -- Read current counts.
    SELECT count INTO v_minute_count
    FROM public.request_quota_counters
    WHERE user_id = p_user_id
      AND window_kind = 'minute'
      AND window_start = v_minute_window;

    SELECT count INTO v_day_count
    FROM public.request_quota_counters
    WHERE user_id = p_user_id
      AND window_kind = 'day'
      AND window_start = v_day_window;

    -- Compute retry-after in seconds for each window.
    v_minute_retry := CEIL(EXTRACT(EPOCH FROM (v_minute_window + INTERVAL '1 minute' - now())))::INT;
    v_day_retry    := CEIL(EXTRACT(EPOCH FROM (v_day_window + INTERVAL '1 day' - now())))::INT;

    -- Check both quotas simultaneously. If either is exceeded, do NOT increment.
    IF v_minute_count >= p_max_per_minute AND v_day_count >= p_max_per_day THEN
        RETURN QUERY SELECT false, v_minute_count, v_day_count, GREATEST(v_minute_retry, v_day_retry);
    ELSIF v_minute_count >= p_max_per_minute THEN
        RETURN QUERY SELECT false, v_minute_count, v_day_count, v_minute_retry;
    ELSIF v_day_count >= p_max_per_day THEN
        RETURN QUERY SELECT false, v_minute_count, v_day_count, v_day_retry;
    END IF;

    -- Both quotas are available — atomically increment both.
    UPDATE public.request_quota_counters
    SET count = count + 1, updated_at = now()
    WHERE user_id = p_user_id
      AND window_kind = 'minute'
      AND window_start = v_minute_window;

    UPDATE public.request_quota_counters
    SET count = count + 1, updated_at = now()
    WHERE user_id = p_user_id
      AND window_kind = 'day'
      AND window_start = v_day_window;

    RETURN QUERY SELECT true, v_minute_count + 1, v_day_count + 1, 0;
END;
$$;

-- Revoke execute from browser roles. Only the API service account's
-- direct PostgreSQL connection can call this function.
REVOKE ALL ON FUNCTION check_and_increment_quota(UUID, INT, INT) FROM PUBLIC, anon, authenticated;
