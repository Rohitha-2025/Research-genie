import { corsHeaders, json } from "../_shared/cors.ts";
import { getUserClient, HttpError } from "../_shared/auth.ts";
import { storeDocument } from "../_shared/ingest.ts";
import { assertPublicHttpUrl } from "../_shared/url-safety.ts";

const MAX_PAGE_CHARS = 5_000_000;
const MAX_REDIRECTS = 3;

/** fetch() that re-validates every redirect target (so a public URL can't bounce to an internal one). */
async function safeFetch(startUrl: URL): Promise<Response> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url.href, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ResearchGenie/1.0)",
        "Accept": "text/html,application/xhtml+xml,text/plain,*/*",
      },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = assertPublicHttpUrl(new URL(res.headers.get("location")!, url).href);
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { supabase, user } = await getUserClient(req);

    const { url } = await req.json();
    if (!url || typeof url !== "string") throw new HttpError(400, "URL is required");

    let parsedUrl: URL;
    try {
      parsedUrl = assertPublicHttpUrl(url.trim());
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "Invalid URL");
    }

    const response = await safeFetch(parsedUrl);
    if (!response.ok) throw new HttpError(502, `Failed to fetch URL: HTTP ${response.status}`);

    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();
    if (rawText.length > MAX_PAGE_CHARS) throw new HttpError(413, "That page is too large to ingest.");

    let text: string;
    let title = parsedUrl.hostname;

    if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
      const titleMatch = rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) title = titleMatch[1].replace(/\s+/g, " ").trim() || title;
      text = htmlToText(rawText);
    } else {
      text = rawText.trim();
    }

    if (!text || text.length < 50) {
      throw new HttpError(
        422,
        "Could not extract meaningful content from the URL. The page may require JavaScript or authentication.",
      );
    }

    const fileSize = new Blob([rawText]).size;
    const doc = await storeDocument(supabase, user.id, {
      fileName: title,
      fileSize,
      text,
      sourceType: "url",
      sourceUrl: parsedUrl.href,
    });

    return json({
      id: doc.id,
      fileName: title,
      fileSize,
      totalChunks: doc.totalChunks,
      preview: doc.preview,
      sourceType: "url",
      sourceUrl: parsedUrl.href,
    });
  } catch (e) {
    console.error("ingest-url error:", e);
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, status);
  }
});
