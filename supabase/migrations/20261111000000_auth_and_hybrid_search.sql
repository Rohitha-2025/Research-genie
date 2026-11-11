-- ============================================================================
-- 1. Real embeddings: switch to 384 dims (Supabase's built-in gte-small model)
--    and add an HNSW index for fast cosine search.
--    The old vector(768) column was never populated, so nothing is lost.
-- ============================================================================
ALTER TABLE public.document_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.document_chunks ADD COLUMN embedding extensions.vector(384);

CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON public.document_chunks USING hnsw (embedding extensions.vector_cosine_ops);

-- ============================================================================
-- 2. Per-user ownership
--    user_id defaults to the caller's id, so inserts made with a user's JWT
--    are automatically owned by that user.
--    NOTE: rows created before this migration have user_id = NULL and become
--    invisible. Re-upload them, or delete them with:
--      DELETE FROM public.documents WHERE user_id IS NULL;
-- ============================================================================
ALTER TABLE public.documents
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.document_chunks
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_documents_user ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_user ON public.document_chunks(user_id);

-- Remove the old "anyone can do anything" policies
DROP POLICY IF EXISTS "Anyone can read documents"   ON public.documents;
DROP POLICY IF EXISTS "Anyone can insert documents" ON public.documents;
DROP POLICY IF EXISTS "Anyone can delete documents" ON public.documents;
DROP POLICY IF EXISTS "Anyone can read chunks"      ON public.document_chunks;
DROP POLICY IF EXISTS "Anyone can insert chunks"    ON public.document_chunks;
DROP POLICY IF EXISTS "Anyone can delete chunks"    ON public.document_chunks;

CREATE POLICY "Users read own documents" ON public.documents
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users insert own documents" ON public.documents
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users delete own documents" ON public.documents
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

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

-- ============================================================================
-- 3. Hybrid search = keyword (Postgres full-text) + semantic (pgvector),
--    merged with Reciprocal Rank Fusion (RRF).
--    SECURITY INVOKER, so RLS applies: users only ever search their own chunks.
-- ============================================================================
DROP FUNCTION IF EXISTS public.search_chunks(TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.hybrid_search(
  query_text       TEXT,
  query_embedding  extensions.vector(384),
  match_limit      INTEGER DEFAULT 5,
  max_distance     FLOAT   DEFAULT 0.5,   -- cosine distance cut-off for semantic hits
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
