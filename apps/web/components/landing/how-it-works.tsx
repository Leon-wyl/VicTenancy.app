const benefits = [
  {
    number: "01",
    title: "Understand the rule",
    body: "Ask about your lease, a notice, your bond or a repair — and get the rule that applies, in plain language.",
  },
  {
    number: "02",
    title: "See the source",
    body: "Every answer points back to the legislation or official guidance it comes from, so you can check it yourself.",
  },
  {
    number: "03",
    title: "Know your next step",
    body: "Leave with a clear picture of your options — what you can ask for, and where to go if things escalate.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="scroll-mt-20 bg-warm-white text-ink"
    >
      <div className="mx-auto max-w-6xl px-5 py-24 md:px-8 md:py-32">
        <p className="font-mono text-[11px] tracking-[0.22em] text-ink/45">
          HOW IT WORKS
        </p>
        <h2
          id="how-it-works-heading"
          className="mt-4 max-w-lg font-display text-3xl font-extrabold tracking-tight md:text-4xl"
        >
          Three steps between you and a clearer tenancy.
        </h2>

        <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {benefits.map((benefit) => (
            <div
              key={benefit.number}
              className="border-t border-ink/15 pt-6"
            >
              <p className="font-mono text-[11px] tracking-[0.18em] text-ink/40">
                {benefit.number}
              </p>
              <h3 className="mt-3 text-lg font-semibold tracking-tight">
                {benefit.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink/60">
                {benefit.body}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-16 max-w-2xl border-l-2 border-mint pl-4 text-sm leading-relaxed text-ink/55">
          VicTenancy provides information grounded in tenancy legislation and
          official sources. It is not a substitute for professional legal
          advice.
        </p>
      </div>
    </section>
  );
}
