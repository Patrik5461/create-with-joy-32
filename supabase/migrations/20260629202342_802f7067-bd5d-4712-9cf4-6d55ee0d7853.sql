
-- ============== TABLES ==============
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('global','direct')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX conversations_one_global ON public.conversations (type) WHERE type = 'global';

GRANT SELECT, INSERT ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.conversation_participants (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_participants_user_idx ON public.conversation_participants (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_participants TO authenticated;
GRANT ALL ON public.conversation_participants TO service_role;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text,
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conv_created_idx ON public.messages (conversation_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.message_mentions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX message_mentions_user_idx ON public.message_mentions (user_id);

GRANT SELECT, INSERT, DELETE ON public.message_mentions TO authenticated;
GRANT ALL ON public.message_mentions TO service_role;
ALTER TABLE public.message_mentions ENABLE ROW LEVEL SECURITY;

-- ============== HELPER FN (SECURITY DEFINER, no recursion) ==============
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conv uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conv AND user_id = _user
  ) OR EXISTS (
    SELECT 1 FROM public.conversations WHERE id = _conv AND type = 'global'
  );
$$;

-- ============== POLICIES ==============
-- conversations
CREATE POLICY "select own or global conv"
  ON public.conversations FOR SELECT TO authenticated
  USING (type = 'global' OR public.is_conversation_participant(id, auth.uid()));
CREATE POLICY "insert conv any auth"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (type = 'direct');

-- conversation_participants
CREATE POLICY "select participants of my convs"
  ON public.conversation_participants FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()));
CREATE POLICY "insert participant (self or to direct conv)"
  ON public.conversation_participants FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.type = 'direct'
    )
  );
CREATE POLICY "update own participant row"
  ON public.conversation_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete own participant row"
  ON public.conversation_participants FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- messages
CREATE POLICY "select messages in my convs"
  ON public.messages FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()));
CREATE POLICY "insert message as self in my convs"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_participant(conversation_id, auth.uid())
  );
CREATE POLICY "update own messages"
  ON public.messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());
CREATE POLICY "delete own messages"
  ON public.messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

-- mentions
CREATE POLICY "select mentions in my convs"
  ON public.message_mentions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id
      AND public.is_conversation_participant(m.conversation_id, auth.uid())
  ));
CREATE POLICY "insert mention by sender"
  ON public.message_mentions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id AND m.sender_id = auth.uid()
  ));

-- ============== RPC: get or create direct ==============
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(_other uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _other = v_me THEN RAISE EXCEPTION 'Cannot start chat with self'; END IF;

  SELECT c.id INTO v_id
  FROM public.conversations c
  WHERE c.type = 'direct'
    AND (SELECT count(*) FROM public.conversation_participants p WHERE p.conversation_id = c.id) = 2
    AND EXISTS (SELECT 1 FROM public.conversation_participants p WHERE p.conversation_id = c.id AND p.user_id = v_me)
    AND EXISTS (SELECT 1 FROM public.conversation_participants p WHERE p.conversation_id = c.id AND p.user_id = _other)
  LIMIT 1;

  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.conversations (type) VALUES ('direct') RETURNING id INTO v_id;
  INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (v_id, v_me), (v_id, _other);
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) TO authenticated;

-- ============== SEED global + trigger ==============
INSERT INTO public.conversations (type) VALUES ('global') ON CONFLICT DO NOTHING;

INSERT INTO public.conversation_participants (conversation_id, user_id)
SELECT (SELECT id FROM public.conversations WHERE type = 'global'), p.id
FROM public.profiles p
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.add_profile_to_global_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_global uuid;
BEGIN
  SELECT id INTO v_global FROM public.conversations WHERE type = 'global' LIMIT 1;
  IF v_global IS NULL THEN
    INSERT INTO public.conversations (type) VALUES ('global') RETURNING id INTO v_global;
  END IF;
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_global, NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_add_to_global_chat ON public.profiles;
CREATE TRIGGER profiles_add_to_global_chat
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.add_profile_to_global_chat();

-- ============== REALTIME ==============
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.message_mentions REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_participants REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_mentions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
