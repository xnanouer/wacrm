-- Platform-managed daily motivational messages, assigned per user and day.

CREATE TABLE IF NOT EXISTS public.platform_motivational_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL CHECK (length(trim(text)) BETWEEN 8 AND 500),
  author TEXT CHECK (author IS NULL OR length(trim(author)) <= 120),
  category TEXT NOT NULL DEFAULT 'general' CHECK (
    category IN ('general', 'sales', 'customer_service', 'leadership')
  ),
  industry TEXT CHECK (
    industry IS NULL OR industry IN ('automotive', 'real_estate_construction')
  ),
  audience TEXT NOT NULL DEFAULT 'all' CHECK (
    audience IN ('all', 'admins', 'agents')
  ),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_motivational_quotes_selection
  ON public.platform_motivational_quotes(is_active, industry, audience, category);

DROP TRIGGER IF EXISTS set_updated_at ON public.platform_motivational_quotes;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.platform_motivational_quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.daily_motivational_quote_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.platform_motivational_quotes(id) ON DELETE SET NULL,
  quote_date DATE NOT NULL,
  text_snapshot TEXT NOT NULL CHECK (length(trim(text_snapshot)) BETWEEN 8 AND 500),
  author_snapshot TEXT,
  category_snapshot TEXT NOT NULL,
  industry_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_motivational_quote_user_date_unique
    UNIQUE (user_id, quote_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_motivational_quote_recent
  ON public.daily_motivational_quote_assignments(user_id, quote_date DESC);

ALTER TABLE public.platform_motivational_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_motivational_quote_assignments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_motivational_quotes FROM anon, authenticated;
REVOKE ALL ON TABLE public.daily_motivational_quote_assignments FROM anon, authenticated;
GRANT ALL ON TABLE public.platform_motivational_quotes TO service_role;
GRANT ALL ON TABLE public.daily_motivational_quote_assignments TO service_role;

-- A small starter set keeps the dashboard useful before the owner uploads
-- their own catalogue. Every row remains editable from the owner panel.
INSERT INTO public.platform_motivational_quotes
  (text, category, industry, audience)
VALUES
  ('Cada conversación bien atendida puede convertirse en una gran oportunidad.', 'customer_service', NULL, 'all'),
  ('Escuchar con atención hoy facilita el cierre de mañana.', 'sales', NULL, 'all'),
  ('La constancia transforma pequeñas acciones en grandes resultados.', 'leadership', NULL, 'all'),
  ('Una respuesta clara puede cambiar por completo la experiencia del cliente.', 'customer_service', NULL, 'all'),
  ('Tu equipo crece cuando cada persona sabe que su trabajo importa.', 'leadership', NULL, 'admins'),
  ('El cliente no solo busca un vehículo; busca seguridad para tomar una decisión.', 'sales', 'automotive', 'all'),
  ('Cada consulta es una oportunidad para acercar al cliente a su próximo vehículo.', 'customer_service', 'automotive', 'agents'),
  ('Conocer el catálogo convierte una pregunta en una recomendación valiosa.', 'sales', 'automotive', 'all'),
  ('Una propiedad correcta comienza con una conversación bien comprendida.', 'sales', 'real_estate_construction', 'all'),
  ('Cada detalle claro acerca al cliente a una decisión segura.', 'customer_service', 'real_estate_construction', 'all');

NOTIFY pgrst, 'reload schema';
