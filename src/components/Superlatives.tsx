import type { Superlative } from '../types'

export function Superlatives({ items }: { items: Superlative[] }) {
  if (items.length === 0) return null
  return (
    <section className="mx-auto max-w-5xl px-6 py-14">
      <div className="text-center">
        <div className="text-4xl">🎟️</div>
        <h2 className="gold-text mt-3 font-display text-3xl font-bold tracking-wide sm:text-4xl">
          The Superlatives
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm italic text-stone-400">
          A little something for everyone — because every team that builds in the open earns a
          curtain call.
        </p>
        <div className="mx-auto mt-6 w-24">
          <div className="gold-rule" />
        </div>
      </div>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((s) => (
          <li
            key={s.title}
            className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-amber-500/30"
          >
            <div className="text-2xl leading-none">{s.emoji}</div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/90">
                {s.title}
              </div>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display text-lg text-stone-100 transition-colors hover:text-amber-300"
              >
                {s.teamName}
              </a>
              <p className="mt-1 text-sm text-stone-400">{s.line}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
