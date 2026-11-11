import { useState, useCallback } from "react";
import { Upload, FileText, X, Loader2, ChevronDown, ChevronUp, Database, Globe, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { processDocument, type ProcessedDocument } from "@/lib/document-processor";
import { ingestUrl } from "@/lib/url-ingestor";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  documents: ProcessedDocument[];
  onDocumentProcessed: (doc: ProcessedDocument) => void;
  onRemoveDocument: (id: string) => void;
}

export function DocumentPanel({ documents, onDocumentProcessed, onRemoveDocument }: Props) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  const handleFile = useCallback(async (file: File) => {
    const validTypes = [".pdf", ".txt", ".md", ".csv"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!validTypes.includes(ext)) {
      toast.error("Unsupported file type. Please upload PDF, TXT, MD, or CSV files.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 20MB.");
      return;
    }

    setIsProcessing(true);
    try {
      const doc = await processDocument(file);
      onDocumentProcessed({ ...doc, sourceType: "file" });
      toast.success(`"${doc.fileName}" ingested — ${doc.totalChunks} chunks`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to process document");
    } finally {
      setIsProcessing(false);
    }
  }, [onDocumentProcessed]);

  const handleUrl = useCallback(async () => {
    if (!urlInput.trim()) return;
    setIsProcessing(true);
    try {
      const doc = await ingestUrl(urlInput.trim());
      onDocumentProcessed({
        id: doc.id,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        totalChunks: doc.totalChunks,
        preview: doc.preview,
        sourceType: "url",
        sourceUrl: doc.sourceUrl,
      });
      toast.success(`"${doc.fileName}" ingested — ${doc.totalChunks} chunks`);
      setUrlInput("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to ingest URL");
    } finally {
      setIsProcessing(false);
    }
  }, [urlInput, onDocumentProcessed]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-border">
        <h2 className="font-semibold text-xs text-foreground flex items-center gap-1.5 tracking-tight">
          <Database className="w-3.5 h-3.5 text-primary" />
          Knowledge Sources
        </h2>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Private to your account
        </p>
      </div>

      <Tabs defaultValue="file" className="flex-1 flex flex-col">
        <div className="px-3 pt-2">
          <TabsList className="w-full h-7">
            <TabsTrigger value="file" className="flex-1 gap-1 text-[10px] h-6">
              <FileText className="w-3 h-3" />
              Files
            </TabsTrigger>
            <TabsTrigger value="url" className="flex-1 gap-1 text-[10px] h-6">
              <Globe className="w-3 h-3" />
              URLs
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="file" className="flex-1 flex flex-col mt-0 px-3 pt-2">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
            className={cn(
              "border border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer",
              isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
            )}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".pdf,.txt,.md,.csv";
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleFile(file);
              };
              input.click();
            }}
          >
            {isProcessing ? (
              <Loader2 className="w-5 h-5 mx-auto text-primary animate-spin" />
            ) : (
              <Upload className="w-5 h-5 mx-auto text-muted-foreground" />
            )}
            <p className="text-[10px] text-muted-foreground mt-1.5">
              {isProcessing ? "Processing..." : "Drop or click to upload"}
            </p>
            <p className="text-[9px] text-muted-foreground/50 mt-0.5">PDF, TXT, MD, CSV · Max 20MB</p>
          </div>
        </TabsContent>

        <TabsContent value="url" className="flex-1 flex flex-col mt-0 px-3 pt-2">
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com"
                className="text-[11px] h-8"
                disabled={isProcessing}
                onKeyDown={(e) => e.key === "Enter" && handleUrl()}
              />
              <Button
                size="sm"
                onClick={handleUrl}
                disabled={!urlInput.trim() || isProcessing}
                className="h-8 w-8 p-0"
              >
                {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link className="w-3 h-3" />}
              </Button>
            </div>
            <p className="text-[9px] text-muted-foreground">
              Scrape, chunk, and index web content
            </p>
          </div>
        </TabsContent>

        {/* Document list */}
        <ScrollArea className="flex-1 px-3 mt-2">
          <div className="space-y-1 pb-3">
            {documents.length === 0 && (
              <div className="text-center py-6">
                <p className="text-[10px] text-muted-foreground">No sources added yet</p>
              </div>
            )}
            {documents.map((doc, idx) => (
              <div key={doc.id} className="bg-muted/50 rounded-lg border border-border">
                <div className="flex items-center gap-1.5 p-2">
                  {doc.sourceType === "url" ? (
                    <Globe className="w-3 h-3 text-accent flex-shrink-0" />
                  ) : (
                    <FileText className="w-3 h-3 text-primary flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium truncate text-foreground">{doc.fileName}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {doc.totalChunks} chunks · {(doc.fileSize / 1024).toFixed(0)}KB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => setExpandedDoc(expandedDoc === idx ? null : idx)}
                  >
                    {expandedDoc === idx ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveDocument(doc.id)}
                  >
                    <X className="w-2.5 h-2.5" />
                  </Button>
                </div>
                {expandedDoc === idx && (
                  <div className="px-2 pb-2 space-y-1">
                    {doc.sourceUrl && (
                      <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] text-primary hover:underline truncate block">
                        {doc.sourceUrl}
                      </a>
                    )}
                    <p className="text-[9px] text-muted-foreground bg-muted p-1.5 rounded font-mono leading-relaxed max-h-24 overflow-auto">
                      {doc.preview}...
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
