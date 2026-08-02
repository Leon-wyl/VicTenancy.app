"use client";

import * as React from "react";
import { ChevronDown, Scale } from "lucide-react";
import { useChat } from "../chat-provider";
import type { CitationSummary } from "../types";
import { cn } from "@/lib/utils";

function hasMetadata(citation: CitationSummary): boolean {
  return Boolean(
    citation.instrumentTitle ||
      citation.instrumentVersion ||
      citation.instrumentType ||
      citation.sectionReference,
  );
}

function CitationBadge({
  citation,
}: {
  citation: CitationSummary;
}) {
  const [open, setOpen] = React.useState(false);
  const expandable = hasMetadata(citation);
  const detailsId = React.useId();

  const badge = (
    <>
      <Scale className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{citation.label}</span>
      {expandable && (
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      )}
    </>
  );

  return (
    <li>
      {expandable ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={detailsId}
          className="inline-flex items-center gap-1.5 rounded-full bg-mint/15 px-2.5 py-1 text-xs font-medium text-forest transition-colors hover:bg-mint/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/40"
        >
          {badge}
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/15 px-2.5 py-1 text-xs font-medium text-forest">
          {badge}
        </span>
      )}
      {expandable && open && (
        <dl
          id={detailsId}
          className="mt-1.5 space-y-1 rounded-lg border border-ink/10 bg-soft-gray/40 px-3 py-2 text-xs text-ink/70"
        >
          {citation.instrumentTitle && (
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium text-ink/50">Instrument</dt>
              <dd>{citation.instrumentTitle}</dd>
            </div>
          )}
          {citation.instrumentVersion && (
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium text-ink/50">Version</dt>
              <dd>{citation.instrumentVersion}</dd>
            </div>
          )}
          {citation.sectionReference && (
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium text-ink/50">Section</dt>
              <dd>{citation.sectionReference}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium text-ink/50">Jurisdiction</dt>
            <dd>{citation.jurisdiction}</dd>
          </div>
        </dl>
      )}
    </li>
  );
}

export function CitationList({
  conversationId,
  messageId,
}: {
  conversationId: string;
  messageId: string;
}) {
  const { citationsFor, ensureCitations } = useChat();
  const citations = citationsFor(messageId);

  React.useEffect(() => {
    if (citations === undefined) {
      ensureCitations(conversationId, messageId);
    }
  }, [citations, conversationId, messageId, ensureCitations]);

  if (!citations || citations.length === 0) return null;

  return (
    <ul className="mt-2.5 flex flex-wrap items-start gap-1.5">
      {citations.map((citation) => (
        <CitationBadge key={citation.id} citation={citation} />
      ))}
    </ul>
  );
}
