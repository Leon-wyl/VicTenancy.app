-- Migration: Auth user mapping and Row Level Security (Step 14b)
-- Creates SECURITY DEFINER trigger to auto-create public.users on auth.users INSERT.
-- Enables RLS on all 5 application tables with ownership-based policies.
-- All policies grant access TO authenticated only using auth.uid() for ownership checks.
-- Do not grant INSERT/UPDATE/DELETE to authenticated on messages, citations, or agent_jobs
-- beyond the narrowly scoped user-message INSERT policy.

-- =============================================================================
-- 1. Auto-create public.users row when a new auth.users record is created
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.users (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 2. Enable Row Level Security on all application tables
-- =============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citations ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. Policies: users
--    Authenticated users may SELECT only their own automatically created row.
--    No INSERT, UPDATE, or DELETE from browser clients.
-- =============================================================================

CREATE POLICY "Users can select own record"
ON public.users
FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()));

-- =============================================================================
-- 4. Policies: conversations
--    Authenticated users have full CRUD on conversations they own.
--    INSERT and UPDATE enforce ownership via WITH CHECK.
-- =============================================================================

CREATE POLICY "Users can select own conversations"
ON public.conversations
FOR SELECT TO authenticated
USING (owner_user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own conversations"
ON public.conversations
FOR INSERT TO authenticated
WITH CHECK (owner_user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own conversations"
ON public.conversations
FOR UPDATE TO authenticated
USING (owner_user_id = (SELECT auth.uid()))
WITH CHECK (owner_user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own conversations"
ON public.conversations
FOR DELETE TO authenticated
USING (owner_user_id = (SELECT auth.uid()));

-- =============================================================================
-- 5. Policies: messages
--    SELECT only through an owned conversation.
--    INSERT only into an owned conversation and only with author_role = 'user'.
--    No UPDATE or DELETE from browser clients — messages are immutable to users.
-- =============================================================================

CREATE POLICY "Users can select messages in own conversations"
ON public.messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.owner_user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Users can insert user messages in own conversations"
ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  author_role = 'user'
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND c.owner_user_id = (SELECT auth.uid())
  )
);

-- =============================================================================
-- 6. Policies: agent_jobs
--    SELECT only where owner_user_id matches auth.uid().
--    No INSERT, UPDATE, or DELETE from browser clients.
-- =============================================================================

CREATE POLICY "Users can select own agent jobs"
ON public.agent_jobs
FOR SELECT TO authenticated
USING (owner_user_id = (SELECT auth.uid()));

-- =============================================================================
-- 7. Policies: citations
--    SELECT only through the citation's message → conversation ownership chain.
--    No INSERT, UPDATE, or DELETE from browser clients.
-- =============================================================================

CREATE POLICY "Users can select citations in own conversations"
ON public.citations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.id = citations.message_id
      AND c.owner_user_id = (SELECT auth.uid())
  )
);

-- =============================================================================
-- 8. Table-level privileges for the authenticated role
--    RLS policies are additive — PostgREST requires table-level GRANT before it
--    evaluates RLS policies. Grant only the operations that RLS policies permit.
-- =============================================================================

GRANT SELECT                         ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT                 ON public.messages TO authenticated;
GRANT SELECT                         ON public.agent_jobs TO authenticated;
GRANT SELECT                         ON public.citations TO authenticated;

