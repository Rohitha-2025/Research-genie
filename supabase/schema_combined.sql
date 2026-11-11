-- ============================================================================
-- Complete Consolidated Database Setup for Research Genie
-- Run this in your Supabase Dashboard: SQL Editor -> New query -> Run
-- ============================================================================

-- 1. Enable extensions
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 2. Create documents table
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL DEFAULT 0,
  preview TEXT,
  source_type TEXT NOT NULL DEFAULT 'file',
  source_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Create document_chunks table with 384-dimension vector embeddings
CREATE TABLE IF NOT EXISTS public.document_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding extensions.vector(384),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Create Indexes
CREATE INDEX IF NOT EXISTS idx_documents_user ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON public.document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_user ON public.document_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_search ON public.document_chunks USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON public.document_chunks USING hnsw (embedding extensions.vector_cosine_ops);

-- 5. Row Level Security (RLS)
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own documents" ON public.documents;
DROP POLICY IF EXISTS "Users insert own documents" ON public.documents;
DROP POLICY IF EXISTS "Users delete own documents" ON public.documents;

CREATE POLICY "Users read own documents" ON public.documents
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users insert own documents" ON public.documents
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users delete own documents" ON public.documents
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users read own chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Users insert own chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Users delete own chunks" ON public.document_chunks;

CREATE POLICY "Users read own chunks" ON public.document_chunks
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users insert own chunks" ON public.document_chunks
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND d.user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY "Users delete own chunks" ON public.document_chunks
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- 6. Hybrid Search Function (Keyword full-text + Semantic vector search with RRF)
CREATE OR REPLACE FUNCTION public.hybrid_search(
  query_text       TEXT,
  query_embedding  extensions.vector(384),
  match_limit      INTEGER DEFAULT 5,
  max_distance     FLOAT   DEFAULT 0.5,
  rrf_k            INTEGER DEFAULT 50
)
RETURNS TABLE(
  id UUID,
  document_id UUID,
  content TEXT,
  file_name TEXT,
  chunk_index INTEGER,
  source_type TEXT,
  source_url TEXT,
  rank REAL
)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH full_text AS (
    SELECT dc.id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(dc.search_vector, websearch_to_tsquery('english', query_text)) DESC
           ) AS rank_ix
    FROM document_chunks dc
    WHERE dc.search_vector @@ websearch_to_tsquery('english', query_text)
    ORDER BY rank_ix
    LIMIT match_limit * 3
  ),
  semantic AS (
    SELECT dc.id,
           ROW_NUMBER() OVER (ORDER BY dc.embedding <=> query_embedding) AS rank_ix
    FROM document_chunks dc
    WHERE dc.embedding IS NOT NULL
      AND (dc.embedding <=> query_embedding) < max_distance
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_limit * 3
  )
  SELECT dc.id,
         dc.document_id,
         dc.content,
         d.file_name,
         dc.chunk_index,
         d.source_type,
         d.source_url,
         (COALESCE(1.0 / (rrf_k + ft.rank_ix), 0.0)
          + COALESCE(1.0 / (rrf_k + sem.rank_ix), 0.0))::REAL AS rank
  FROM full_text ft
  FULL OUTER JOIN semantic sem ON ft.id = sem.id
  JOIN document_chunks dc ON dc.id = COALESCE(ft.id, sem.id)
  JOIN documents d ON d.id = dc.document_id
  ORDER BY rank DESC
  LIMIT match_limit;
$$;

