import { show } from './data'
import { AwardCard } from './components/AwardCard'
import { Superlatives } from './components/Superlatives'
import { Statuette } from './components/Statuette'
import type { Tier } from './types'

const fmt = (n: number) => n.toLocaleString('en-US')

const TIERS: Record<Tier, { label: string; tagline: string }> = {
  marquee: {
    label: 'The Marquee Awards',
    tagline: 'By popular acclaim — the build threads the whole community rallied around.',
  },
  spotlight: {
    label: 'The Spotlight Awards',
    tagline: 'Shining a light beyond the usual names — quieter threads, newer teams, global crews.',
  },
  juried: {
    label: 'The Juried Awards',
    tagline: 'Judged by an AI that actually read every thread, start to finish.',
  },
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="gold-text font-display text-3xl font-bold sm:text-4xl">{fmt(value)}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.25em] text-stone-400">{label}</div>
    </div>
  )
}

function TierBanner({ tier }: { tier: Tier }) {
  const t = TIERS[tier]
  return (
    <div className="mx-auto max-w-3xl px-6 pt-16 text-center">
      <div className="mx-auto mb-5 w-16">
        <div className="gold-rule" />
      </div>
      <h2 className="font-display text-sm font-bold uppercase tracking-[0.45em] text-amber-400">
        {t.label}
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-sm italic text-stone-400">{t.tagline}</p>
    </div>
  )
}

export default function App() {
  const hasShow = show.categories.length > 0

  return (
    <div className="stage-bg min-h-screen">
      {/* ---------- Hero / marquee ---------- */}
      <header className="relative mx-auto max-w-4xl px-6 pt-20 pb-10 text-center">
        <Statuette className="shimmer mx-auto h-28 w-14" />
        <p className="mt-6 text-sm uppercase tracking-[0.5em] text-amber-400/90">
          The {show.season} Open Alliance
        </p>
        <h1 className="gold-text mt-3 font-display text-5xl font-black leading-tight tracking-tight sm:text-7xl">
          Awards
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg italic text-stone-300">
          A tongue-in-cheek, black-tie celebration of the{' '}
          <a
            href="https://www.chiefdelphi.com/c/first/open-alliance/89"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-300 underline-offset-4 hover:underline"
          >
            Open Alliance
          </a>{' '}
          build threads. In the spirit of FRC, the spotlight is shared widely — from the season's
          biggest hits to its hidden gems, newest teams, and crews building all around the world.
        </p>

        {hasShow && (
          <>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
              <Stat value={show.stats.threads} label="Build Threads" />
              <Stat value={show.stats.posts} label="Posts" />
              <Stat value={show.stats.totalLikes} label="Likes Given" />
              <Stat value={show.stats.totalViews} label="Total Views" />
            </div>
            {show.stats.teamsCelebrated > 0 && (
              <p className="mt-8 font-display text-xl text-amber-200">
                🎉 {show.stats.teamsCelebrated} different teams take home an honor tonight.
              </p>
            )}
          </>
        )}
        <div className="mx-auto mt-12 w-40">
          <div className="gold-rule" />
        </div>
      </header>

      {/* ---------- The ceremony ---------- */}
      <main className="pb-16">
        {hasShow ? (
          <>
            {show.categories.map((category, i) => {
              const prev = show.categories[i - 1]
              const newTier = !prev || prev.tier !== category.tier
              return (
                <div key={category.key}>
                  {newTier ? (
                    <TierBanner tier={category.tier} />
                  ) : (
                    <div className="mx-auto w-32">
                      <div className="gold-rule opacity-40" />
                    </div>
                  )}
                  <AwardCard category={category} index={i} />
                </div>
              )
            })}

            <div className="mx-auto mt-8 w-40">
              <div className="gold-rule opacity-60" />
            </div>
            <Superlatives items={show.superlatives} />
          </>
        ) : (
          <div className="mx-auto max-w-xl px-6 py-20 text-center text-stone-400">
            <p className="font-display text-2xl text-amber-200">The stage is set…</p>
            <p className="mt-4">
              No ceremony data yet. Run{' '}
              <code className="rounded bg-white/10 px-2 py-0.5 text-amber-300">npm run harvest</code>{' '}
              then{' '}
              <code className="rounded bg-white/10 px-2 py-0.5 text-amber-300">npm run judge</code>{' '}
              to bake <code className="text-amber-300">data/awards-{show.season}.json</code>.
            </p>
          </div>
        )}
      </main>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-white/5 px-6 py-10 text-center text-sm text-stone-500">
        <Statuette className="mx-auto mb-4 h-10 w-5 opacity-60" />
        <p>
          The Open Alliance Awards — a fan-made parody. Made with admiration for every team that
          built in the open.
        </p>
        <p className="mt-2">
          Data harvested from{' '}
          <a
            href="https://www.chiefdelphi.com/c/first/open-alliance/89"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400/80 hover:underline"
          >
            Chief Delphi · Open Alliance
          </a>
          . Not affiliated with FIRST, Chief Delphi, or the Academy of anything.
        </p>
      </footer>
    </div>
  )
}
