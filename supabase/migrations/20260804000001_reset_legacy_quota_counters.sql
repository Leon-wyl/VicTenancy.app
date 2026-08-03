-- The original quota policy counted every authenticated request, including
-- Realtime reconciliation reads. The API now meters only state-changing
-- requests, but existing counters cannot distinguish legacy reads from writes.
-- Reset only this derived, non-business state once so users are not locked out
-- until the next UTC day after the policy change.

DELETE FROM public.request_quota_counters;
