import { FUNCTIONS_URL, authHeaders } from "@/lib/api";

export interface IngestedUrl {
  id: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  preview: string;
  sourceType: "url";
  sourceUrl: string;
}

export async function ingestUrl(url: string): Promise<IngestedUrl> {
  const isDemo = localStorage.getItem("research_genie_demo_mode") === "true";
  if (isDemo) {
    let hostname = "web-page";
    try {
      hostname = new URL(url).hostname;
    } catch {
      // ignore
    }
    return {
      id: crypto.randomUUID(),
      fileName: hostname,
      fileSize: 2048,
      totalChunks: 3,
      preview: `Web page content fetched from ${url}`,
      sourceType: "url",
      sourceUrl: url,
    };
  }

  const resp = await fetch(`${FUNCTIONS_URL}/ingest-url`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ url }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Ingestion failed" }));
    throw new Error(err.error || `Error ${resp.status}`);
  }

  return resp.json();
}
