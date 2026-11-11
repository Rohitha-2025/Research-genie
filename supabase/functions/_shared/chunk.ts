// Pure TypeScript (no Deno APIs) so it can be unit-tested with vitest.

export interface Chunk {
  content: string;
  tokenCount: number; // approximate: word count
}

/**
 * Sliding-window chunker.
 * Defaults (220 words, 40 overlap) keep each chunk comfortably under the
 * 512-token input limit of the gte-small embedding model.
 */
export function chunkText(
  text: string,
  chunkSize = 220,
  overlap = 40,
  maxChunks = 300,
): Chunk[] {
  if (overlap >= chunkSize) throw new Error("overlap must be smaller than chunkSize");

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const chunks: Chunk[] = [];
  const step = chunkSize - overlap;

  for (let i = 0; i < words.length && chunks.length < maxChunks; i += step) {
    const slice = words.slice(i, i + chunkSize);
    const content = slice.join(" ").trim();
    if (content) chunks.push({ content, tokenCount: slice.length });
    if (i + chunkSize >= words.length) break; // last window reached the end
  }
  return chunks;
}
