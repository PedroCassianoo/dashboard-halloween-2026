-- =====================================================================
-- HALLOWEEN PARTY 2026 · RED BALLOON PAULÍNIA
-- Schema DDL Ultra-Resiliente (Supabase / PostgreSQL)
-- =====================================================================

-- 1. TABELA DE ESTÁGIOS / TURMAS (stages)
CREATE TABLE IF NOT EXISTS public.stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garante que todas as colunas necessárias existam (mesmo se a tabela já foi criada antes)
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. TABELA DE INSCRIÇÕES (registrations)
CREATE TABLE IF NOT EXISTS public.registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    stage_id UUID NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garante todas as colunas necessárias em registrations caso a tabela já existisse
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS student_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS normalized_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES public.stages(id) ON DELETE CASCADE;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Garante a restrição UNIQUE para evitar duplicados no mesmo estágio
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'registrations_normalized_name_stage_id_key'
    ) THEN
        ALTER TABLE public.registrations 
        ADD CONSTRAINT registrations_normalized_name_stage_id_key UNIQUE (normalized_name, stage_id);
    END IF;
END $$;

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_registrations_stage_id ON public.registrations(stage_id);
CREATE INDEX IF NOT EXISTS idx_registrations_normalized_name ON public.registrations(normalized_name);
CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON public.registrations(created_at DESC);

-- 3. TRIGGER PARA ATUALIZAÇÃO AUTOMÁTICA DE updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_registrations_updated_at ON public.registrations;
CREATE TRIGGER trigger_registrations_updated_at
BEFORE UPDATE ON public.registrations
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 4. VIEW DE RESUMO AGREGADO (v_dashboard_summary)
-- Remove definição antiga para evitar erros de alteração de tipos de colunas
DROP VIEW IF EXISTS public.v_dashboard_summary CASCADE;

CREATE OR REPLACE VIEW public.v_dashboard_summary AS
SELECT
    s.id AS stage_id,
    s.code AS stage_code,
    s.name AS stage_name,
    s.capacity AS total_students,
    s.sort_order,
    COUNT(r.id)::INT AS enrolled_count,
    CASE
        WHEN s.capacity > 0 THEN ROUND((COUNT(r.id)::NUMERIC / s.capacity) * 100, 1)
        ELSE 0
    END AS percentage,
    CASE
        WHEN COUNT(r.id) <= 3 THEN TRUE
        ELSE FALSE
    END AS is_critical
FROM public.stages s
LEFT JOIN public.registrations r ON r.stage_id = s.id
GROUP BY s.id, s.code, s.name, s.capacity, s.sort_order
ORDER BY s.sort_order ASC;

-- 5. CARGA INICIAL (SEED) DAS 11 TURMAS OFICIAIS
INSERT INTO public.stages (code, name, capacity, sort_order)
VALUES
    ('K1', 'Kinder 1', 8, 1),
    ('K2', 'Kinder 2', 22, 2),
    ('J',  'Junior Starter', 24, 3),
    ('J1', 'Junior 1', 27, 4),
    ('J2', 'Junior 2', 30, 5),
    ('T1', 'Teens 1', 24, 6),
    ('T2', 'Teens 2', 24, 7),
    ('T3', 'Teens 3', 26, 8),
    ('T4', 'Teens 4', 7, 9),
    ('T5', 'Teens 5', 7, 10),
    ('T6', 'Teens 6', 5, 11)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    capacity = EXCLUDED.capacity,
    sort_order = EXCLUDED.sort_order;

-- 6. POLÍTICAS DE SEGURANÇA (RLS)
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de turmas para todos" ON public.stages;
CREATE POLICY "Permitir leitura de turmas para todos"
ON public.stages FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Permitir leitura de inscritos para todos" ON public.registrations;
CREATE POLICY "Permitir leitura de inscritos para todos"
ON public.registrations FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Permitir insercao de inscritos" ON public.registrations;
CREATE POLICY "Permitir insercao de inscritos"
ON public.registrations FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir atualizacao de inscritos" ON public.registrations;
CREATE POLICY "Permitir atualizacao de inscritos"
ON public.registrations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir exclusao de inscritos" ON public.registrations;
CREATE POLICY "Permitir exclusao de inscritos"
ON public.registrations FOR DELETE TO anon, authenticated USING (true);

-- 7. ATIVAÇÃO SEGURA DO SUPABASE REALTIME
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
              AND schemaname = 'public' 
              AND tablename = 'registrations'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.registrations;
        END IF;
    END IF;
END $$;
