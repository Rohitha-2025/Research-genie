import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, FileText, Globe, Trash2, Zap, ChevronRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessage } from "@/components/ChatMessage";
import { SourcesPanel } from "@/components/SourcesPanel";
import { RAGPipelineStatus } from "@/components/RAGPipelineStatus";
import { DocumentPanel } from "@/components/DocumentPanel";
import { streamChat, type ChatMessage as ChatMsg, type RetrievedSource, type PipelineInfo, type CriticInfo, type VerifierInfo } from "@/lib/chat-stream";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { type ProcessedDocument } from "@/lib/document-processor";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const SUGGESTIONS = [
  { text: "Summarize key findings", icon: FileText },
  { text: "Compare viewpoints across sources", icon: Globe },
  { text: "Find claims with evidence", icon: Zap },
  { text: "What topics are covered?", icon: ChevronRight },
];

export default function Index() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<ProcessedDocument[]>([]);
  const [latestSources, setLatestSources] = useState<RetrievedSource[]>([]);
  const [pipelineInfo, setPipelineInfo] = useState<PipelineInfo | null>(null);
  const [criticInfo, setCriticInfo] = useState<CriticInfo | null>(null);
  const [verifierInfo, setVerifierInfo] = useState<VerifierInfo | null>(null);
  const [pipelineStage, setPipelineStage] = useState<"idle" | "retrieving" | "generating" | "critiquing" | "verifying" | "done">("idle");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user, signOut } = useAuth();

  // Documents now persist per user: load them from the database on sign-in.
  useEffect(() => {
    if (!user) return;
    if (user.id === "demo-user-id") {
      const stored = localStorage.getItem("research_genie_demo_docs");
      if (stored) {
        try {
          setDocuments(JSON.parse(stored));
          return;
        } catch {
          // fall through
        }
      }
      const initialDocs: ProcessedDocument[] = [
        {
          id: "demo-doc-1",
          fileName: "Sample Research Paper.pdf",
          fileSize: 245000,
          totalChunks: 12,
          preview: "This study investigates autonomous multi-agent verification pipelines for large language model retrieval-augmented generation (RAG)...",
          sourceType: "file",
        },
      ];
      setDocuments(initialDocs);
      localStorage.setItem("research_genie_demo_docs", JSON.stringify(initialDocs));
      return;
    }

    supabase
      .from("documents")
      .select("id, file_name, file_size, total_chunks, preview, source_type, source_url")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.warn("Could not fetch documents from Supabase:", error.message);
          return;
        }
        setDocuments((data ?? []).map((d) => ({
          id: d.id,
          fileName: d.file_name,
          fileSize: d.file_size,
          totalChunks: d.total_chunks,
          preview: d.preview ?? "",
          sourceType: d.source_type === "url" ? "url" : "file",
          sourceUrl: d.source_url ?? undefined,
        })));
      })
      .catch((err) => {
        console.warn("Error fetching documents:", err);
      });
  }, [user]);

  const removeDocument = async (id: string) => {
    if (user?.id === "demo-user-id") {
      setDocuments(prev => {
        const next = prev.filter(d => d.id !== id);
        localStorage.setItem("research_genie_demo_docs", JSON.stringify(next));
        return next;
      });
      return;
    }

    // RLS guarantees users can only delete their own rows; chunks cascade.
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) { toast.error("Couldn't delete that document"); return; }
    setDocuments(prev => prev.filter(d => d.id !== id));
  };

  const handleDocumentProcessed = (doc: ProcessedDocument) => {
    setDocuments(prev => {
      const next = [...prev, doc];
      if (user?.id === "demo-user-id") {
        localStorage.setItem("research_genie_demo_docs", JSON.stringify(next));
      }
      return next;
    });
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, latestSources, pipelineStage, criticInfo, verifierInfo]);

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: ChatMsg = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setLatestSources([]);
    setPipelineInfo(null);
    setCriticInfo(null);
    setVerifierInfo(null);
    setPipelineStage("retrieving");

    let assistantContent = "";
    const setAssistant = (content: string) => {
      assistantContent = content;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content } : m);
        }
        return [...prev, { role: "assistant", content }];
      });
    };

    await streamChat({
      messages: [...messages, userMsg],
      onSources: setLatestSources,
      onPipeline: setPipelineInfo,
      onStage: setPipelineStage,
      onCritic: setCriticInfo,
      onVerifier: setVerifierInfo,
      onDelta: (chunk) => setAssistant(assistantContent + chunk),
      onReplace: (full) => setAssistant(full),
      onDone: () => {
        setIsLoading(false);
        setPipelineStage("done");
      },
      onError: (err) => {
        console.warn("Chat API error, falling back to demo mode:", err);
        // Don't show error to user, the app will fall back to demo simulation
        setIsLoading(false);
        setPipelineStage("idle");
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setLatestSources([]);
    setPipelineInfo(null);
    setCriticInfo(null);
    setVerifierInfo(null);
    setPipelineStage("idle");
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* LEFT: Document Panel - always visible */}
      <div className="w-[280px] flex-shrink-0 border-r border-border bg-card/50">
        <DocumentPanel
          documents={documents}
          onDocumentProcessed={handleDocumentProcessed}
          onRemoveDocument={removeDocument}
        />
      </div>

      {/* CENTER: Chat Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-card/30 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground tracking-tight">Research Workspace</h1>
              <p className="text-[10px] text-muted-foreground">Hybrid search · Critic · Verifier</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user?.id === "demo-user-id" && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium border border-amber-500/20">
                Demo Mode
              </span>
            )}
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground hover:text-destructive h-7 text-xs gap-1">
                <Trash2 className="w-3 h-3" /> Clear
              </Button>
            )}
            <span className="text-[10px] text-muted-foreground max-w-[160px] truncate hidden sm:block">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground h-7 text-xs gap-1">
              <LogOut className="w-3 h-3" /> Sign out
            </Button>
          </div>
        </header>

        {/* Chat area */}
        <div className="flex-1 overflow-hidden">
          <div ref={scrollRef} className="h-full overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-4 gradient-mesh">
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="text-center max-w-md">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10 flex items-center justify-center mx-auto mb-5 shadow-sm">
                    <Sparkles className="w-7 h-7 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground mb-1.5 tracking-tight">Research Assistant</h2>
                  <p className="text-xs text-muted-foreground mb-5 leading-relaxed max-w-sm mx-auto">
                    Ask questions grounded in your uploaded documents. Every answer goes through retrieval, critique, and verification.
                  </p>

                  {/* Pipeline visualization */}
                  <div className="flex items-center justify-center gap-1 mb-5">
                    {["Retrieve", "Generate", "Critique", "Verify"].map((step, i) => (
                      <div key={step} className="flex items-center gap-1">
                        <span className="text-[10px] px-2 py-1 rounded-md bg-muted text-muted-foreground font-medium">{step}</span>
                        {i < 3 && <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {SUGGESTIONS.map((s) => {
                      const Icon = s.icon;
                      return (
                        <button
                          key={s.text}
                          onClick={() => send(s.text)}
                          className="flex items-center gap-2 text-left text-[11px] px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-secondary/80 hover:border-primary/20 transition-all text-foreground group"
                        >
                          <Icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                          {s.text}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </div>
            ) : (
              <div className="py-3">
                <AnimatePresence>
                  {messages.map((msg, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
                      <ChatMessage message={msg} isStreaming={isLoading && i === messages.length - 1 && msg.role === "assistant"} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-border bg-card/30 backdrop-blur-md p-3">
          <div className="max-w-2xl mx-auto">
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a research question..."
                  className="min-h-[40px] max-h-28 resize-none bg-background border-border rounded-lg text-sm pr-3 py-2.5"
                  rows={1}
                  disabled={isLoading}
                />
              </div>
              <Button
                onClick={() => send(input)}
                disabled={!input.trim() || isLoading}
                size="icon"
                className="rounded-lg h-[40px] w-[40px] flex-shrink-0 bg-gradient-to-br from-primary to-primary/90 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
            {isLoading && (
              <div className="flex items-center gap-1.5 mt-2">
                <div className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-primary animate-pulse-soft" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 rounded-full bg-primary animate-pulse-soft" style={{ animationDelay: "150ms" }} />
                  <span className="w-1 h-1 rounded-full bg-primary animate-pulse-soft" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-[10px] text-muted-foreground capitalize">
                  {pipelineStage === "retrieving" && "Searching documents..."}
                  {pipelineStage === "generating" && "Generating draft answer..."}
                  {pipelineStage === "critiquing" && "Critic agent reviewing..."}
                  {pipelineStage === "verifying" && "Verifier agent checking claims..."}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: Pipeline Status & Sources Panel - always visible */}
      <div className="w-[300px] flex-shrink-0 border-l border-border bg-card/30 flex flex-col overflow-hidden">
        {/* Top half: RAG Pipeline Status (stages + Critic + Verifier scores) */}
        <div className="flex-1 border-b border-border overflow-hidden">
          <RAGPipelineStatus
            stage={pipelineStage}
            pipelineInfo={pipelineInfo}
            criticInfo={criticInfo}
            verifierInfo={verifierInfo}
          />
        </div>
        {/* Bottom half: Retrieved Sources */}
        <div className="flex-1 overflow-hidden">
          <SourcesPanel sources={latestSources} />
        </div>
      </div>
    </div>
  );
}
