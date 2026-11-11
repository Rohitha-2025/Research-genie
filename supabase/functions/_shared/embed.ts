// Supabase Edge Runtime ships a built-in embedding model (gte-small, 384 dims).
// No external API key needed.
// deno-lint-ignore no-explicit-any
declare const Supabase: any;

const session = new Supabase.ai.Session("gte-small");

export async function embed(text: string): Promise<number[]> {
  const out = await session.run(text, { mean_pool: true, normalize: true });
  return Array.from(out as ArrayLike<number>);
}
