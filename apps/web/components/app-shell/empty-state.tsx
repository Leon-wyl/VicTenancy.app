export function EmptyState() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-16 md:py-24">
      <div className="space-y-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink/40">
          Victorian tenancy
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
          How can we help with your tenancy today?
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-ink/60">
          Ask about your lease, a notice, your bond, or a repair. Answers are
          grounded in Victorian tenancy law and official sources, with
          citations you can check yourself.
        </p>
      </div>

      <div className="mt-10 rounded-2xl border border-dashed border-ink/15 bg-soft-gray/40 p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-ink/50">Prompt area</p>
          <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-[11px] font-medium text-ink/40">
            Coming in Step 18
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink/40">
          Your tenancy questions will appear here once chat is available.
        </p>
      </div>
    </div>
  );
}
