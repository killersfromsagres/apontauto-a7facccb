-- 1) Arquivamento por usuário
ALTER TABLE public.notification_receipts
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 2) Preferências por canal
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  inapp boolean NOT NULL DEFAULT true,
  toast boolean NOT NULL DEFAULT true,
  som boolean NOT NULL DEFAULT false,
  email boolean NOT NULL DEFAULT false,
  whatsapp boolean NOT NULL DEFAULT false,
  categorias_silenciadas text[] NOT NULL DEFAULT '{}'::text[],
  prioridade_minima text NOT NULL DEFAULT 'info',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_prefs_self" ON public.notification_preferences;
CREATE POLICY "notif_prefs_self" ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_notification_preferences_updated ON public.notification_preferences;
CREATE TRIGGER trg_notification_preferences_updated
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) Emissão de eventos automáticos
CREATE OR REPLACE FUNCTION public.notificar_evento(
  p_evento text,
  p_titulo text,
  p_corpo text DEFAULT NULL,
  p_categoria text DEFAULT 'informacao',
  p_severidade text DEFAULT 'info',
  p_deep_link text DEFAULT NULL,
  p_modulo text DEFAULT 'abastecimento-agua',
  p_requires_ack boolean DEFAULT false,
  p_dedupe_key text DEFAULT NULL,
  p_alvos jsonb DEFAULT '[]'::jsonb,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_mode text := 'all';
  v_key text := coalesce(nullif(btrim(p_dedupe_key), ''), p_evento);
  v_has_user boolean;
  v_has_role boolean;
  v_has_module boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.agua_can('read') OR public.can_manage_notifications()) THEN
    RAISE EXCEPTION 'sem permissao';
  END IF;
  IF coalesce(btrim(p_titulo), '') = '' THEN RAISE EXCEPTION 'titulo obrigatorio'; END IF;

  -- Anti-repetição: mesmo evento/chave nas últimas 12 horas
  SELECT n.id INTO v_id
    FROM public.notifications n
   WHERE n.metadata->>'dedupe' = v_key
     AND n.created_at > now() - interval '12 hours'
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT bool_or(a->>'user_id' IS NOT NULL),
         bool_or(a->>'role_key' IS NOT NULL),
         bool_or(a->>'module_key' IS NOT NULL)
    INTO v_has_user, v_has_role, v_has_module
    FROM jsonb_array_elements(coalesce(p_alvos, '[]'::jsonb)) a;

  v_mode := CASE
    WHEN coalesce(v_has_user, false) THEN 'users'
    WHEN coalesce(v_has_role, false) THEN 'roles'
    WHEN coalesce(v_has_module, false) THEN 'modules'
    ELSE 'all' END;

  INSERT INTO public.notifications (
    title, body, severity, category, target_mode, module_key,
    deep_link, requires_ack, status, created_by, metadata
  ) VALUES (
    p_titulo, nullif(btrim(coalesce(p_corpo, '')), ''), coalesce(p_severidade, 'info'),
    coalesce(p_categoria, 'informacao'), v_mode, p_modulo, p_deep_link,
    coalesce(p_requires_ack, false), 'published', v_uid,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('dedupe', v_key, 'evento', p_evento, 'origem', 'automatico')
  ) RETURNING id INTO v_id;

  IF v_mode <> 'all' THEN
    INSERT INTO public.notification_targets (notification_id, user_id, role_key, module_key, team_key)
    SELECT v_id,
           nullif(a->>'user_id','')::uuid,
           nullif(a->>'role_key',''),
           nullif(a->>'module_key',''),
           nullif(a->>'team_key','')
      FROM jsonb_array_elements(coalesce(p_alvos, '[]'::jsonb)) a;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notificar_evento(text,text,text,text,text,text,text,boolean,text,jsonb,jsonb) TO authenticated;