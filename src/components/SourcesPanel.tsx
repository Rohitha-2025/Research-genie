import { FileText, Globe, ExternalLink, Search } from "lucide-react";
import type { RetrievedSource } from "@/lib/chat-stream";
import { cn } from "@/lib/utils";

interface Props {
  sources: RetrievedSource[];
}

export function SourcesPanel({ sources }: Props) {
  if (sources.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Search className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">
          Retrieved Context ({sources.length})
        </span>
      </div>
      <div className="space-y-1.5">
        {sources.map((source) => (
          <div
            key={source.index}
            className={cn(
              "p-2.5 rounded-lg bg-card border border-border",
              "hover:border-primary/30 transition-colors"
            )}
          >
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 mt-0.5">
                {source.sourceType === "url" ? (
                  <Globe className="w-3.5 h-3.5 text-accent" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[10px] text-muted-foreground">[{source.index}]</span>
                  <span className="text-[11px] font-medium text-foreground truncate">{source.sourceName}</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  <span className="capitalize">{source.sourceType}</span> · {source.location}
                </div>
                {source.sourceUrl && (
                  <a
                    href={source.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline mt-0.5"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    <span className="truncate max-w-[140px]">{new URL(source.sourceUrl).hostname}</span>
                  </a>
                )}
                <div className="mt-1.5">
                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/50 rounded-full transition-all"
                      style={{ width: `${Math.min(source.relevance * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground mt-0.5 block">
                    Relevance: {(source.relevance * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
