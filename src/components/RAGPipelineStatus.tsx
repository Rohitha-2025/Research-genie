import { Search, Database, Bot, CheckCircle, AlertCircle, ShieldCheck, BadgeCheck, CircleAlert } from "lucide-react";
import type { PipelineInfo, CriticInfo, VerifierInfo } from "@/lib/chat-stream";
import { cn } from "@/lib/utils";

interface Props {
  pipeline: PipelineInfo | null;
  critic: CriticInfo | null;
  verifier: VerifierInfo | null;
  isLoading: boolean;
  stage: "idle" | "retrieving" | "generating" | "critiquing" | "verifying" | "done";
}

const steps = [
  { key: "query", label: "Query", icon: Search },
  { key: "retrieve", label: "Retrieve", icon: Database },
  { key: "generate", label: "Generate", icon: Bot },
  { key: "critique", label: "Critic", icon: ShieldCheck },
  { key: "verify", label: "Verify", icon: BadgeCheck },
  { key: "done", label: "Done", icon: CheckCircle },
] as const;

function getActiveStep(stage: Props["stage"]) {
  switch (stage) {
    case "idle": return -1;
    case "retrieving": return 1;
    case "generating": return 2;
    case "critiquing": return 3;
    case "verifying": return 4;
    case "done": return 5;
  }
}

function ScoreBadge({ score, max = 5 }: { score: number; max?: number }) {
  const ratio = score / max;
  const color = ratio >= 0.8 ? "text-success bg-success/10" : ratio >= 0.6 ? "text-warning bg-warning/10" : "text-destructive bg-destructive/10";
  return <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-mono font-bold", color)}>{score}/{max}</span>;
}

function ConfidenceBadge({ score, label }: { score: number; label: string }) {
  const color = score >= 0.8 ? "text-success bg-success/10" : score >= 0.5 ? "text-warning bg-warning/10" : "text-destructive bg-destructive/10";
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold", color)}>
      {label} {Math.round(score * 100)}%
    </span>
  );
}

export function RAGPipelineStatus({ pipeline, critic, verifier, isLoading, stage }: Props) {
  if (stage === "idle") return null;

  const activeStep = getActiveStep(stage);

  return (
    <div className="space-y-3">
      {/* Pipeline steps - vertical for sidebar */}
      <div>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pipeline</span>
        <div className="mt-1.5 space-y-0.5">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === activeStep;
            const isDone = i < activeStep;
            const isPending = i > activeStep;

            return (
              <div key={step.key} className="flex items-center gap-2 py-0.5">
                <div
                  className={cn(
                    "w-4.5 h-4.5 rounded flex items-center justify-center transition-colors",
                    isDone && "bg-success/15 text-success",
                    isActive && "bg-primary text-primary-foreground",
                    isPending && "bg-muted text-muted-foreground"
                  )}
                  style={{ width: 18, height: 18 }}
                >
                  <Icon className="w-2.5 h-2.5" />
                </div>
                <span className={cn(
                  "text-[11px]",
                  isDone && "text-success",
                  isActive && "text-foreground font-semibold",
                  isPending && "text-muted-foreground"
                )}>
                  {step.label}
                </span>
                {isActive && isLoading && (
                  <span className="w-1 h-1 rounded-full bg-primary animate-pulse-soft ml-auto" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Retrieval info */}
      {pipeline && (
        <div className="text-[11px]">
          {pipeline.hasContext ? (
            <span className="flex items-center gap-1 text-success">
              <CheckCircle className="w-3 h-3" />
              {pipeline.chunksRetrieved} chunks retrieved
            </span>
          ) : (
            <span className="flex items-center gap-1 text-warning">
              <AlertCircle className="w-3 h-3" />
              No matching documents
            </span>
          )}
        </div>
      )}

      {/* Critic evaluation */}
      {critic?.evaluation && (
        <div className="border-t border-border pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-foreground flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-accent" />
              Critic Review
            </span>
            <div className="flex items-center gap-1.5">
              <ScoreBadge score={critic.evaluation.overall_score} />
              {critic.wasImproved && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-accent/10 text-accent font-medium">Improved</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-5 gap-0.5">
            {Object.entries(critic.evaluation.evaluation).map(([key, val]) => (
              <div key={key} className="text-center">
                <div className="text-[8px] text-muted-foreground capitalize leading-tight">
                  {key.replace(/_/g, " ").replace("answers question", "rel.").replace("logical consistency", "logic").replace("citation accuracy", "cite")}
                </div>
                <ScoreBadge score={val.score} />
              </div>
            ))}
          </div>

          <p className="text-[10px] text-muted-foreground italic leading-snug">
            {critic.evaluation.summary}
          </p>
        </div>
      )}

      {/* Verifier evaluation */}
      {verifier?.evaluation && (
        <div className="border-t border-border pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-foreground flex items-center gap-1">
              <BadgeCheck className="w-3 h-3 text-primary" />
              Verifier
            </span>
            <div className="flex items-center gap-1.5">
              <ConfidenceBadge score={verifier.evaluation.confidence_score} label={verifier.evaluation.confidence_label} />
              {verifier.wasVerified && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-destructive/10 text-destructive font-medium">Fixed</span>
              )}
            </div>
          </div>

          {/* Claims breakdown */}
          <div className="grid grid-cols-3 gap-1">
            <div className="text-center px-1.5 py-1 rounded bg-success/5 border border-success/10">
              <div className="text-[8px] text-muted-foreground">Supported</div>
              <span className="text-[11px] font-bold text-success">{verifier.evaluation.supported}</span>
            </div>
            <div className="text-center px-1.5 py-1 rounded bg-warning/5 border border-warning/10">
              <div className="text-[8px] text-muted-foreground">Partial</div>
              <span className="text-[11px] font-bold text-warning">{verifier.evaluation.partially_supported}</span>
            </div>
            <div className="text-center px-1.5 py-1 rounded bg-destructive/5 border border-destructive/10">
              <div className="text-[8px] text-muted-foreground">Unsupported</div>
              <span className="text-[11px] font-bold text-destructive">{verifier.evaluation.unsupported}</span>
            </div>
          </div>

          {/* Individual claims */}
          {verifier.evaluation.claims.length > 0 && (
            <div className="space-y-0.5 max-h-28 overflow-y-auto">
              {verifier.evaluation.claims.map((claim, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10px] py-0.5">
                  {claim.status === "supported" ? (
                    <CheckCircle className="w-2.5 h-2.5 text-success flex-shrink-0 mt-0.5" />
                  ) : claim.status === "partially_supported" ? (
                    <AlertCircle className="w-2.5 h-2.5 text-warning flex-shrink-0 mt-0.5" />
                  ) : (
                    <CircleAlert className="w-2.5 h-2.5 text-destructive flex-shrink-0 mt-0.5" />
                  )}
                  <span className="text-muted-foreground leading-snug">
                    {claim.claim}
                    {claim.source_ref && <span className="text-primary ml-0.5">{claim.source_ref}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {verifier.evaluation.hallucination_detected && (
            <div className="flex items-center gap-1 text-[10px] text-destructive bg-destructive/5 rounded px-2 py-1 border border-destructive/10">
              <CircleAlert className="w-3 h-3" />
              Hallucination detected — corrected
            </div>
          )}

          <p className="text-[10px] text-muted-foreground italic leading-snug">
            {verifier.evaluation.summary}
          </p>
        </div>
      )}
    </div>
  );
}
