import { MessageComposer } from "@/features/chat/components/message-composer";

export default function AppPage() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:h-screen">
      <div className="flex flex-1 items-center overflow-y-auto px-5 py-10">
        <div className="mx-auto w-full max-w-2xl space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink/40">
            Victorian tenancy
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
            How can we help with your tenancy today?
          </h1>
          <p className="max-w-xl text-[15px] leading-relaxed text-ink/60">
            Ask about your lease, a notice, your bond, or a repair. Answers
            are grounded in Victorian tenancy law and official sources, with
            citations you can check yourself.
          </p>
        </div>
      </div>
      <MessageComposer conversationId={null} />
    </div>
  );
}
