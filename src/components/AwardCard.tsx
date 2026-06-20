import type { Category } from '../types'
import { Statuette } from './Statuette'

export function AwardCard({ category, index }: { category: Category; index: number }) {
  const { winner, nominees, quote } = category
  return (
    <section
      className="rise mx-auto max-w-3xl px-6 py-14"
      style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
    >
      {/* Category header */}
      <div className="text-center">
        <div className="text-5xl">{category.emoji}</div>
        <h2 className="gold-text mt-3 font-display text-3xl font-bold tracking-wide sm:text-4xl">
          {category.title}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm italic text-stone-400">
          {category.blurb}
        </p>
        {category.presenter && (
          <p className="mx-auto mt-4 max-w-xl text-[0.95rem] text-stone-300">
            “{category.presenter}”
          </p>
        )}
        <div className="mx-auto mt-6 w-24">
          <div className="gold-rule" />
        </div>
      </div>

      {/* Winner */}
      <div className="mt-8 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-b from-velvet-light to-velvet shadow-[0_0_40px_-12px_rgba(212,175,55,0.4)]">
        <div className="flex flex-col items-center gap-5 p-7 sm:flex-row sm:items-stretch">
          <div className="flex shrink-0 items-center justify-center sm:w-16">
            <Statuette className="shimmer h-24 w-12" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-400">
              Winner
            </div>
            <a
              href={winner.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block font-display text-2xl font-bold text-amber-100 transition-colors hover:text-amber-300 sm:text-3xl"
            >
              {winner.teamName}
            </a>
            {winner.stat && (
              <div className="mt-1 font-display text-lg text-amber-300">{winner.stat}</div>
            )}
            <p className="mt-3 text-stone-300">{winner.citation}</p>

            {quote && (
              <blockquote className="mt-4 border-l-2 border-amber-500/40 pl-4 text-left italic text-stone-300">
                “{quote.text}”
                <footer className="mt-1 text-sm not-italic text-stone-500">
                  — {quote.author}
                </footer>
              </blockquote>
            )}

            <a
              href={winner.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-xs uppercase tracking-widest text-amber-400/80 underline-offset-4 hover:underline"
            >
              Read the thread on Chief Delphi →
            </a>
          </div>
        </div>
      </div>

      {/* Nominees */}
      {nominees.length > 0 && (
        <div className="mt-7">
          <div className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">
            Also nominated
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {nominees.map((n, i) => (
              <li
                key={`${n.url}-${i}`}
                className="rounded-xl border border-white/5 bg-white/[0.02] p-4"
              >
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-display text-lg text-stone-100 transition-colors hover:text-amber-300"
                >
                  {n.teamName}
                </a>
                {n.stat && <span className="ml-2 text-sm text-amber-400/80">{n.stat}</span>}
                <p className="mt-1 text-sm text-stone-400">{n.citation}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
