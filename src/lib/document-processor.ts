import { FUNCTIONS_URL, authHeaders } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";

export interface ProcessedDocument {
  id: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  preview: string;
  sourceType?: "file" | "url";
  sourceUrl?: string;
}

export async function processDocument(file: File): Promise<ProcessedDocument> {
  const isDemo = localStorage.getItem("research_genie_demo_mode") === "true";

  // If not in demo mode, try calling the deployed edge function first
  if (!isDemo) {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const resp = await fetch(`${FUNCTIONS_URL}/process-document`, {
        method: "POST",
        headers: await authHeaders(),
        body: formData,
      });

      if (resp.ok) {
        return await resp.json();
      }
    } catch (e) {
      console.warn("Edge function process-document unavailable, using direct client processor:", e);
    }
  }

  // Client-side parsing and database insertion fallback
  let text = "";
  try {
    text = await file.text();
  } catch {
    text = `Extracted content from ${file.name}`;
  }

  const words = text.split(/\s+/).filter(Boolean);
  const chunkSize = 220;
  const totalChunks = Math.max(1, Math.ceil(words.length / chunkSize));
  const preview = words.slice(0, 50).join(" ") || `Document: ${file.name}`;

  // If signed in, store directly in Supabase documents table
  try {
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user && !isDemo) {
      const { data: doc, error } = await supabase
        .from("documents")
        .insert({
          file_name: file.name,
          file_size: file.size,
          total_chunks: totalChunks,
          preview,
          source_type: "file",
        })
        .select()
        .single();

      if (!error && doc) {
        // Insert chunks
        const chunks = [];
        for (let i = 0; i < words.length; i += chunkSize) {
          chunks.push({
            document_id: doc.id,
            chunk_index: Math.floor(i / chunkSize),
            content: words.slice(i, i + chunkSize).join(" "),
            token_count: Math.min(chunkSize, words.length - i),
          });
        }
        if (chunks.length > 0) {
          await supabase.from("document_chunks").insert(chunks);
        }

        return {
          id: doc.id,
          fileName: doc.file_name,
          fileSize: doc.file_size,
          totalChunks: doc.total_chunks,
          preview: doc.preview ?? preview,
          sourceType: "file",
        };
      }
    }
  } catch (err) {
    console.warn("Direct Supabase storage failed, using local document state:", err);
  }

  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    fileSize: file.size,
    totalChunks,
    preview,
    sourceType: "file",
  };
}
