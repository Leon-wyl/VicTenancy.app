import type { ChatMessage } from "../types";
import { CitationList } from "./citation-list";

export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.authorRole === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-mint px-4 py-2.5 text-[15px] leading-relaxed text-ink md:max-w-[75%]">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] md:max-w-[85%]">
        <div className="whitespace-pre-wrap rounded-2xl rounded-bl-md border border-ink/10 bg-white px-4 py-2.5 text-[15px] leading-relaxed text-ink">
          {message.content}
        </div>
        <CitationList
          conversationId={message.conversationId}
          messageId={message.id}
        />
      </div>
    </div>
  );
}
