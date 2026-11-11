import { extractText, getDocumentProxy } from "npm:unpdf@1.4.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { getUserClient, HttpError } from "../_shared/auth.ts";
import { storeDocument } from "../_shared/ingest.ts";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { supabase, user } = await getUserClient(req);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) throw new HttpError(400, "No file provided");
    if (file.size > MAX_FILE_BYTES) throw new HttpError(413, "File too large. Maximum size is 20MB.");

    const name = file.name.toLowerCase();
    let text = "";

    if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv")) {
      text = await file.text();
    } else if (name.endsWith(".pdf")) {
      // Real PDF parsing (handles compressed streams, fonts, multi-page layouts)
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const result = await extractText(pdf, { mergePages: true });
      text = result.text as string;
      if (!text.trim()) {
        throw new HttpError(
          422,
          "This PDF has no selectable text (it looks scanned). OCR isn't supported yet.",
        );
      }
    } else {
      throw new HttpError(400, "Unsupported file type. Please upload PDF, TXT, MD, or CSV files.");
    }

    if (!text.trim()) throw new HttpError(422, "Could not extract text from the document.");

    const doc = await storeDocument(supabase, user.id, {
      fileName: file.name,
      fileSize: file.size,
      text,
    });

    return json({
      id: doc.id,
      fileName: file.name,
      fileSize: file.size,
      totalChunks: doc.totalChunks,
      preview: doc.preview,
    });
  } catch (e) {
    console.error("process-document error:", e);
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, status);
  }
});
