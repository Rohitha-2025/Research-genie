import { corsHeaders, json } from "../_shared/cors.ts";
import { getUserClient, HttpError } from "../_shared/auth.ts";
import { embed } from "../_shared/embed.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { supabase } = await getUserClient(req);

    const { query, limit = 5 } = await req.json();
    if (!query || typeof query !== "string") throw new HttpError(400, "Query is required");

    const { data: chunks, error } = await supabase.rpc("hybrid_search", {
      query_text: query,
      query_embedding: await embed(query),
      match_limit: Math.min(Math.max(Number(limit) || 5, 1), 20),
    });
    if (error) throw new Error(`Search failed: ${error.message}`);

    // deno-lint-ignore no-explicit-any
    const results = (chunks || []).map((c: any) => ({
      id: c.id,
      content: c.content,
      sourceName: c.file_name,
      sourceType: c.source_type || "file",
      sourceUrl: c.source_url || null,
      sourceLocation: `Chunk ${c.chunk_index + 1}`,
      relevanceScore: c.rank,
    }));

    return json({ query, totalResults: results.length, results });
  } catch (e) {
    console.error("retrieve error:", e);
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, status);
  }
});
