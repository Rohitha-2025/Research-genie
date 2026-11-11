import { chunkText } from "./chunk.ts";
import { embed } from "./embed.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/**
 * Shared by process-document and ingest-url:
 * chunk -> embed -> store document + chunks (as the signed-in user).
 */
export async function storeDocument(
  supabase: SupabaseClient,
  userId: string,
  meta: {
    fileName: string;
    fileSize: number;
    text: string;
    sourceType?: "file" | "url";
    sourceUrl?: string;
  },
) {
  const chunks = chunkText(meta.text);
  if (chunks.length === 0) throw new Error("No text could be extracted.");
  const preview = meta.text.slice(0, 500);

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      file_name: meta.fileName,
      file_size: meta.fileSize,
      total_chunks: chunks.length,
      preview,
      source_type: meta.sourceType ?? "file",
      source_url: meta.sourceUrl ?? null,
    })
    .select("id")
    .single();
  if (docError) throw new Error(`Failed to store document: ${docError.message}`);

  try {
    const rows = [];
    for (let i = 0; i < chunks.length; i++) {
      rows.push({
        user_id: userId,
        document_id: doc.id,
        chunk_index: i,
        content: chunks[i].content,
        token_count: chunks[i].tokenCount,
        embedding: await embed(chunks[i].content),
      });
    }

    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await supabase.from("document_chunks").insert(rows.slice(i, i + 50));
      if (error) throw new Error(`Failed to store chunks: ${error.message}`);
    }
  } catch (e) {
    // Don't leave a half-ingested document behind (chunks cascade-delete).
    await supabase.from("documents").delete().eq("id", doc.id);
    throw e;
  }

  return { id: doc.id as string, totalChunks: chunks.length, preview };
}
