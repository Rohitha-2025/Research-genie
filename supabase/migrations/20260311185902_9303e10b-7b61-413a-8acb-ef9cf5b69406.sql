
-- Add source_type and source_url columns to documents
ALTER TABLE public.documents ADD COLUMN source_type TEXT NOT NULL DEFAULT 'file';
ALTER TABLE public.documents ADD COLUMN source_url TEXT;

-- Drop and recreate search function with source metadata
DROP FUNCTION IF EXISTS public.search_chunks;

CREATE OR REPLACE FUNCTION public.search_chunks(query_text TEXT, match_limit INTEGER DEFAULT 5)
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
SET search_path = public
AS $$
  SELECT 
    dc.id,
    dc.document_id,
    dc.content,
    d.file_name,
    dc.chunk_index,
    d.source_type,
    d.source_url,
    ts_rank(dc.search_vector, websearch_to_tsquery('english', query_text)) AS rank
  FROM public.document_chunks dc
  JOIN public.documents d ON d.id = dc.document_id
  WHERE dc.search_vector @@ websearch_to_tsquery('english', query_text)
  ORDER BY rank DESC
  LIMIT match_limit;
$$;
