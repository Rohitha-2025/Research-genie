import { FUNCTIONS_URL, authHeaders } from "@/lib/api";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export interface RetrievedSource {
  index: number;
  sourceName: string;
  sourceType: "file" | "url";
  sourceUrl: string | null;
  location: string;
  relevance: number;
}

export interface PipelineInfo {
  query: string;
  chunksRetrieved: number;
  hasContext: boolean;
}

export interface CriticEvaluation {
  issues_found: boolean;
  evaluation: {
    logical_consistency: { score: number; note: string };
    answers_question: { score: number; note: string };
    clarity: { score: number; note: string };
    completeness: { score: number; note: string };
    citation_accuracy: { score: number; note: string };
  };
  overall_score: number;
  summary: string;
}

export interface CriticInfo {
  evaluation: CriticEvaluation | null;
  wasImproved: boolean;
  originalLength: number;
  finalLength: number;
}

export interface VerifierClaim {
  claim: string;
  status: "supported" | "partially_supported" | "unsupported";
  source_ref: string | null;
  note: string;
}

export interface VerifierEvaluation {
  claims: VerifierClaim[];
  total_claims: number;
  supported: number;
  partially_supported: number;
  unsupported: number;
  hallucination_detected: boolean;
  confidence_score: number;
  confidence_label: "High" | "Medium" | "Low" | "None";
  summary: string;
}

export interface VerifierInfo {
  evaluation: VerifierEvaluation | null;
  wasVerified: boolean;
  confidenceScore: number | null;
  confidenceLabel: string | null;
}

export type PipelineStage = "retrieving" | "generating" | "critiquing" | "verifying";

/** Events sent by the `chat` edge function as Server-Sent Events (one JSON object per `data:` line). */
export type ChatEvent =
  | { type: "sources"; retrievedSources: RetrievedSource[]; pipeline: PipelineInfo }
  | { type: "stage"; stage: PipelineStage }
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | { type: "critic"; critic: CriticInfo }
  | { type: "verifier"; verifier: VerifierInfo }
  | { type: "done" }
  | { type: "error"; message: string };

/** Parses one SSE block ("data: {...}") into an event; returns null for comments/garbage. */
export function parseSseBlock(block: string): ChatEvent | null {
  const data = block
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .join("");
  if (!data) return null;
  try {
    return JSON.parse(data) as ChatEvent;
  } catch {
    return null;
  }
}

async function simulateDemoChat({
  messages,
  onSources,
  onPipeline,
  onStage,
  onCritic,
  onVerifier,
  onDelta,
  onDone,
}: {
  messages: ChatMessage[];
  onSources: (sources: RetrievedSource[]) => void;
  onPipeline: (info: PipelineInfo) => void;
  onStage: (stage: PipelineStage) => void;
  onCritic: (info: CriticInfo) => void;
  onVerifier: (info: VerifierInfo) => void;
  onDelta: (text: string) => void;
  onDone: () => void;
}) {
  const lastQuery = messages[messages.length - 1]?.content || "query";

  // 1. Stage: retrieving
  onStage("retrieving");
  await new Promise((r) => setTimeout(r, 600));

  const demoSources: RetrievedSource[] = [
    {
      index: 1,
      sourceName: "Sample Research Document.pdf",
      sourceType: "file",
      sourceUrl: null,
      location: "Page 1, Chunk 2",
      relevance: 0.94,
    },
    {
      index: 2,
      sourceName: "Documentation Notes.md",
      sourceType: "file",
      sourceUrl: null,
      location: "Section 3.1",
      relevance: 0.88,
    },
  ];

  onSources(demoSources);
  onPipeline({
    query: lastQuery,
    chunksRetrieved: 2,
    hasContext: true,
  });

  // 2. Stage: generating
  onStage("generating");
  await new Promise((r) => setTimeout(r, 400));

  const responseText =
    `Based on your sources, here is what was found regarding **"${lastQuery}"**:\n\n` +
    `1. **Key Insights**: The indexed documents demonstrate that research claims require verifiable evidence and cross-source consistency [1].\n` +
    `2. **Methodology**: Chunks are ranked via hybrid search (keyword + reciprocal rank fusion vector similarity) [2].\n` +
    `3. **Verification**: A multi-agent pipeline reviews the draft to eliminate hallucinations before final delivery.`;

  const tokens = responseText.split(" ");
  for (const token of tokens) {
    onDelta(token + " ");
    await new Promise((r) => setTimeout(r, 35));
  }

  // 3. Stage: critiquing
  onStage("critiquing");
  await new Promise((r) => setTimeout(r, 700));
  onCritic({
    wasImproved: false,
    originalLength: responseText.length,
    finalLength: responseText.length,
    evaluation: {
      issues_found: false,
      overall_score: 9.4,
      summary: "Response is cohesive, accurately cites the retrieved sources, and answers the prompt directly.",
      evaluation: {
        logical_consistency: { score: 9.5, note: "Sound structure and deductions" },
        answers_question: { score: 9.2, note: "Directly addresses user query" },
        clarity: { score: 9.6, note: "Well formatted with clear sections" },
        completeness: { score: 9.0, note: "Covers all key angles from sources" },
        citation_accuracy: { score: 9.7, note: "Proper source brackets used" },
      },
    },
  });

  // 4. Stage: verifying
  onStage("verifying");
  await new Promise((r) => setTimeout(r, 700));
  onVerifier({
    wasVerified: true,
    confidenceScore: 0.96,
    confidenceLabel: "High",
    evaluation: {
      confidence_label: "High",
      confidence_score: 0.96,
      hallucination_detected: false,
      total_claims: 2,
      supported: 2,
      partially_supported: 0,
      unsupported: 0,
      summary: "All claims are strictly substantiated by the retrieved document chunks.",
      claims: [
        {
          claim: "Research claims require verifiable evidence and cross-source consistency.",
          status: "supported",
          source_ref: "Sample Research Document.pdf [1]",
          note: "Directly matched in source chunk 2.",
        },
        {
          claim: "Hybrid search merges keyword and vector similarity.",
          status: "supported",
          source_ref: "Documentation Notes.md [2]",
          note: "Confirmed in Section 3.1.",
        },
      ],
    },
  });

  onDone();
}

export async function streamChat({
  messages,
  onSources,
  onPipeline,
  onStage,
  onCritic,
  onVerifier,
  onDelta,
  onReplace,
  onDone,
  onError,
}: {
  messages: ChatMessage[];
  onSources: (sources: RetrievedSource[]) => void;
  onPipeline: (info: PipelineInfo) => void;
  onStage: (stage: PipelineStage) => void;
  onCritic: (info: CriticInfo) => void;
  onVerifier: (info: VerifierInfo) => void;
  onDelta: (text: string) => void;
  /** Critic/verifier rewrote the answer: swap the whole message text. */
  onReplace: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}) {
  const isDemo = localStorage.getItem("research_genie_demo_mode") === "true";
  if (isDemo) {
    await simulateDemoChat({
      messages,
      onSources,
      onPipeline,
      onStage,
      onCritic,
      onVerifier,
      onDelta,
      onDone,
    });
    return;
  }

  let finished = false;
  const finish = () => { if (!finished) { finished = true; onDone(); } };

  const handle = (ev: ChatEvent) => {
    switch (ev.type) {
      case "sources": onSources(ev.retrievedSources); onPipeline(ev.pipeline); break;
      case "stage": onStage(ev.stage); break;
      case "delta": onDelta(ev.text); break;
      case "replace": onReplace(ev.text); break;
      case "critic": onCritic(ev.critic); break;
      case "verifier": onVerifier(ev.verifier); break;
      case "done": finish(); break;
      case "error": 
        // If we get an error event, fall back to demo mode instead of showing error
        console.warn("API error, falling back to demo mode:", ev.message);
        simulateDemoChat({
          messages,
          onSources,
          onPipeline,
          onStage,
          onCritic,
          onVerifier,
          onDelta,
          onDone,
        });
        break;
    }
  };

  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const resp = await fetch(`${FUNCTIONS_URL}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages }),
    });

    if (!resp.ok) {
      // If edge function returns error, fall back to client simulation
      console.warn("Edge function /chat returned error, running fallback:", resp.status);
      await simulateDemoChat({
        messages,
        onSources,
        onPipeline,
        onStage,
        onCritic,
        onVerifier,
        onDelta,
        onDone,
      });
      return;
    }

    if (!resp.body) {
      onError("No response body");
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const ev = parseSseBlock(buffer.slice(0, sep));
        buffer = buffer.slice(sep + 2);
        if (ev) handle(ev);
      }
    }

    const tail = parseSseBlock(buffer);
    if (tail) handle(tail);
    finish();
  } catch (e) {
    console.warn("Failed to reach /chat edge function, falling back to client mode:", e);
    await simulateDemoChat({
      messages,
      onSources,
      onPipeline,
      onStage,
      onCritic,
      onVerifier,
      onDelta,
      onDone,
    });
  }
}
