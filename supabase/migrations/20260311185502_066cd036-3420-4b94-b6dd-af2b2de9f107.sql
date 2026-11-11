
-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create document metadata table
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL DEFAULT 0,
  preview TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create document chunks table with vector embeddings
CREATE TABLE public.document_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding vector(768),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for fast search
CREATE INDEX idx_chunks_document ON public.document_chunks(document_id);
CREATE INDEX idx_chunks_search ON public.document_chunks USING GIN(search_vector);

-- Full-text search function
CREATE OR REPLACE FUNCTION public.search_chunks(query_text TEXT, match_limit INTEGER DEFAULT 5)
RETURNS TABLE(id UUID, document_id UUID, content TEXT, file_name TEXT, chunk_index INTEGER, rank REAL)
LANGUAGE sql STABLE
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

-- RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read documents" ON public.documents FOR SELECT USING (true);
CREATE POLICY "Anyone can insert documents" ON public.documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete documents" ON public.documents FOR DELETE USING (true);

CREATE POLICY "Anyone can read chunks" ON public.document_chunks FOR SELECT USING (true);
CREATE POLICY "Anyone can insert chunks" ON public.document_chunks FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete chunks" ON public.document_chunks FOR DELETE USING (true);
