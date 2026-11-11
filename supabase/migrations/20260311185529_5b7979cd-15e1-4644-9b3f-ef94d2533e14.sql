
-- Move vector extension to a dedicated schema
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;

-- Fix search function search_path
CREATE OR REPLACE FUNCTION public.search_chunks(query_text TEXT, match_limit INTEGER DEFAULT 5)
RETURNS TABLE(id UUID, document_id UUID, content TEXT, file_name TEXT, chunk_index INTEGER, rank REAL)
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
    ts_rank(dc.search_vector, websearch_to_tsquery('english', query_text)) AS rank
  FROM public.document_chunks dc
  JOIN public.documents d ON d.id = dc.document_id
  WHERE dc.search_vector @@ websearch_to_tsquery('english', query_text)
  ORDER BY rank DESC
  LIMIT match_limit;
$$;
