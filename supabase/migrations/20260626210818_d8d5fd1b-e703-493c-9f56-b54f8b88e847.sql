
-- Trigger helper for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- CLIENTS
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_clients_select" ON public.clients FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_clients_insert" ON public.clients FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_clients_update" ON public.clients FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_clients_delete" ON public.clients FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX clients_user_id_idx ON public.clients(user_id);
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- INTERACTIONS (visitas/ligações/reuniões)
CREATE TABLE public.interactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'visita',
  happened_at TIMESTAMPTZ NOT NULL,
  contact_person TEXT,
  notes TEXT,
  follow_up_at TIMESTAMPTZ,
  follow_up_done BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interactions TO authenticated;
GRANT ALL ON public.interactions TO service_role;
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_interactions_select" ON public.interactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_interactions_insert" ON public.interactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_interactions_update" ON public.interactions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_interactions_delete" ON public.interactions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX interactions_user_idx ON public.interactions(user_id);
CREATE INDEX interactions_client_idx ON public.interactions(client_id);
CREATE INDEX interactions_followup_idx ON public.interactions(user_id, follow_up_done, follow_up_at);
CREATE TRIGGER interactions_updated_at BEFORE UPDATE ON public.interactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- SALES
CREATE TABLE public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  amount NUMERIC(12,2),
  description TEXT,
  post_sale_due_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '3 days'),
  post_sale_done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_sales_select" ON public.sales FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_sales_insert" ON public.sales FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_sales_update" ON public.sales FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_sales_delete" ON public.sales FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX sales_user_idx ON public.sales(user_id);
CREATE INDEX sales_client_idx ON public.sales(client_id);
CREATE INDEX sales_postsale_idx ON public.sales(user_id, post_sale_done_at, post_sale_due_at);
CREATE TRIGGER sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
