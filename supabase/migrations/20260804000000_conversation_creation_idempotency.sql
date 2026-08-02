ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS creation_idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_creation_idempotency
  ON public.conversations (owner_user_id, creation_idempotency_key)
  WHERE creation_idempotency_key IS NOT NULL;
