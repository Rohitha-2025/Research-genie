import ReactMarkdown from "react-markdown";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage as ChatMsg } from "@/lib/chat-stream";

interface Props {
  message: ChatMsg;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2.5 py-2 px-4", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-primary/15 to-accent/10 flex items-center justify-center mt-0.5">
          <Bot className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-3.5 py-2.5",
          isUser
            ? "bg-primary text-primary-foreground shadow-sm"
            : "bg-card border border-border shadow-sm"
        )}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose text-sm text-card-foreground">
            <ReactMarkdown>{message.content}</ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 bg-primary/50 animate-pulse-soft ml-0.5 rounded-sm align-middle" />
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-secondary flex items-center justify-center mt-0.5">
          <User className="w-3.5 h-3.5 text-secondary-foreground" />
        </div>
      )}
    </div>
  );
}
