-- =============================================================================
-- Step 18: Chat Realtime publication
-- =============================================================================
-- Add the chat tables to the supabase_realtime publication so the web client
-- can subscribe to row changes over Supabase Realtime (postgres_changes).
--
-- Deliberately minimal:
--   * No REPLICA IDENTITY FULL — the UI only needs new-row payloads
--     (INSERT new row / UPDATE new row); old-row transport is unnecessary.
--   * No DELETE subscriptions — Supabase DELETE events cannot be filtered, so
--     conversation deletion is handled by optimistic local removal after a
--     successful API DELETE.
--   * No grant/policy changes — browser read access stays governed by the
--     existing RLS policies; the API remains the source of truth.
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_jobs;
