import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AwardsShow, Category, Superlative, Tier } from '../types'
import { Statuette } from './Statuette'

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

type Slide =
  | { type: 'intro' }
  | { type: 'tier'; tier: Tier }
  | { type: 'award'; category: Category }
  | { type: 'superlatives'; items: Superlative[]; part: number }
  | { type: 'outro' }

/** Stable, shareable URL slug for each slide (the bit after `#/`). */
function slugFor(slide: Slide): string {
  switch (slide.type) {
    case 'intro':
      return ''
    case 'tier':
      return `tier-${slide.tier}`
    case 'award':
      return slide.category.key
    case 'superlatives':
      return `superlatives-${slide.part}`
    case 'outro':
      return 'wrap'
  }
}

/** Human-readable label for a slide, used in share text. */
function labelFor(slide: Slide): string {
  switch (slide.type) {
    case 'intro':
      return 'The Open Alliance Awards'
    case 'tier':
      return TIERS[slide.tier].label
    case 'award':
      return slide.category.title
    case 'superlatives':
      return 'The Superlatives'
    case 'outro':
      return "That's a wrap"
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function buildSlides(show: AwardsShow): Slide[] {
  const slides: Slide[] = [{ type: 'intro' }]

  // Build up to the headliners: least-prestigious tiers first, Best Picture as the finale.
  const ordered = [...show.categories].reverse()
  let lastTier: Tier | null = null
  for (const category of ordered) {
    if (category.tier !== lastTier) {
      slides.push({ type: 'tier', tier: category.tier })
      lastTier = category.tier
    }
    slides.push({ type: 'award', category })
  }

  chunk(show.superlatives, 4).forEach((items, i) => {
    slides.push({ type: 'superlatives', items, part: i + 1 })
  })

  slides.push({ type: 'outro' })
  return slides
}

export function Wrapped({ show }: { show: AwardsShow }) {
  const slides = useMemo(() => buildSlides(show), [show])
  const slugs = useMemo(() => slides.map(slugFor), [slides])

  // The URL hash (`#/best-picture`) is the source of truth: deep links, the
  // share button, and browser back/forward all resolve through it.
  const indexFromHash = useCallback(() => {
    const slug = window.location.hash.replace(/^#\/?/, '')
    const i = slugs.indexOf(slug)
    return i >= 0 ? i : 0
  }, [slugs])

  const [index, setIndex] = useState(indexFromHash)
  const [dir, setDir] = useState<1 | -1>(1)

  // Resolve hash → slide whenever it changes (typed URL, share link, back/forward).
  // Direction is inferred from the jump so the swipe animation still plays.
  useEffect(() => {
    const sync = () =>
      setIndex((cur) => {
        const next = indexFromHash()
        if (next !== cur) setDir(next > cur ? 1 : -1)
        return next
      })
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [indexFromHash])

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(slides.length - 1, next))
      const slug = slugs[clamped]
      // Writing the hash fires `hashchange`, which updates index + direction
      // and adds a history entry so each slide is independently linkable.
      if (window.location.hash.replace(/^#\/?/, '') !== slug) {
        window.location.hash = `/${slug}`
      }
    },
    [slides.length, slugs],
  )
  const advance = useCallback(() => go(index + 1), [go, index])
  const rewind = useCallback(() => go(index - 1), [go, index])

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        advance()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        rewind()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, rewind])

  // Touch swipe + tap, kept from firing the synthetic click twice.
  const touch = useRef<{ x: number; y: number } | null>(null)
  const ignoreClick = useRef(false)

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touch.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current
    touch.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      ignoreClick.current = true
      if (dx < 0) advance()
      else rewind()
    }
  }

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (ignoreClick.current) {
      ignoreClick.current = false
      return
    }
    // Don't hijack taps on links/buttons.
    if ((e.target as HTMLElement).closest('a, button')) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (e.clientX - rect.left < rect.width * 0.33) rewind()
    else advance()
  }

  const slide = slides[index]

  return (
    <div
      className="stage-bg relative h-dvh w-full select-none overflow-hidden"
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Segmented progress bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1.5 px-3 pt-3 sm:px-5 sm:pt-4">
        {slides.map((_, i) => (
          <button
            key={i}
            aria-label={`Go to slide ${i + 1}`}
            onClick={(e) => {
              e.stopPropagation()
              go(i)
            }}
            className="group h-1 flex-1 rounded-full bg-white/15"
          >
            <span
              className={`block h-full rounded-full transition-all duration-300 ${
                i <= index ? 'bg-amber-400' : 'bg-transparent group-hover:bg-white/25'
              }`}
              style={{ width: i <= index ? '100%' : '0%' }}
            />
          </button>
        ))}
      </div>

      {/* The card stage. key remounts each slide so the enter animation replays. */}
      <div className="absolute inset-0 flex items-center justify-center overflow-y-auto px-6 pt-12 pb-16">
        <div
          key={index}
          className={dir === 1 ? 'slide-in-right w-full' : 'slide-in-left w-full'}
        >
          <SlideView slide={slide} show={show} onReplay={() => go(0)} />
        </div>
      </div>

      {/* Desktop nav chevrons + hint */}
      {index > 0 && (
        <button
          aria-label="Previous"
          onClick={(e) => {
            e.stopPropagation()
            rewind()
          }}
          className="absolute left-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full p-3 text-2xl text-stone-500 transition-colors hover:text-amber-300 sm:block"
        >
          ‹
        </button>
      )}
      {index < slides.length - 1 && (
        <button
          aria-label="Next"
          onClick={(e) => {
            e.stopPropagation()
            advance()
          }}
          className="absolute right-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full p-3 text-2xl text-stone-500 transition-colors hover:text-amber-300 sm:block"
        >
          ›
        </button>
      )}
      <p className="pointer-events-none absolute inset-x-0 bottom-4 z-10 text-center text-[0.7rem] uppercase tracking-[0.3em] text-stone-600">
        Swipe · tap · ← →
      </p>

      <ShareButton label={labelFor(slide)} season={show.season} />
    </div>
  )
}

function ShareButton({ label, season }: { label: string; season: number }) {
  const [copied, setCopied] = useState(false)

  const share = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const url = window.location.href
    const data = { title: `The ${season} Open Alliance Awards`, text: label, url }
    // Native share sheet on mobile; copy-to-clipboard fallback everywhere else.
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(data)
        return
      } catch {
        // user dismissed the sheet — do nothing
        return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button
      onClick={share}
      aria-label="Share this page"
      className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-velvet/70 px-3 py-1.5 text-[0.7rem] uppercase tracking-[0.2em] text-amber-300 backdrop-blur transition-colors hover:bg-amber-500/10 sm:bottom-4 sm:right-4"
    >
      <span aria-hidden>{copied ? '✓' : '⤴'}</span>
      {copied ? 'Copied' : 'Share'}
    </button>
  )
}

function SlideView({
  slide,
  show,
  onReplay,
}: {
  slide: Slide
  show: AwardsShow
  onReplay: () => void
}) {
  switch (slide.type) {
    case 'intro':
      return <IntroSlide show={show} />
    case 'tier':
      return <TierSlide tier={slide.tier} />
    case 'award':
      return <AwardSlide category={slide.category} />
    case 'superlatives':
      return <SuperlativesSlide items={slide.items} />
    case 'outro':
      return <OutroSlide show={show} onReplay={onReplay} />
  }
}

function IntroSlide({ show }: { show: AwardsShow }) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <Statuette className="shimmer mx-auto h-32 w-32" />
      <p className="mt-5 text-sm uppercase tracking-[0.5em] text-amber-400/90">
        The {show.season} Open Alliance
      </p>
      <h1 className="gold-text mt-2 font-display text-6xl font-black leading-none tracking-tight sm:text-7xl">
        Awards
      </h1>
      <p className="mx-auto mt-5 max-w-md text-base italic text-stone-300">
        A black-tie celebration of the{' '}
        <a
          href="https://www.chiefdelphi.com/c/first/open-alliance/89"
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-300 underline-offset-4 hover:underline"
        >
          Open Alliance
        </a>{' '}
        build threads — from the season's biggest hits to its hidden gems.
      </p>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
        <Stat value={show.stats.threads} label="Build Threads" />
        <Stat value={show.stats.posts} label="Posts" />
        <Stat value={show.stats.totalLikes} label="Likes Given" />
        <Stat value={show.stats.totalViews} label="Total Views" />
      </div>

      <p className="mt-10 text-sm uppercase tracking-[0.3em] text-amber-300/80">
        Tap to begin →
      </p>
    </div>
  )
}

function TierSlide({ tier }: { tier: Tier }) {
  const t = TIERS[tier]
  return (
    <div className="mx-auto max-w-lg text-center">
      <div className="mx-auto mb-6 w-16">
        <div className="gold-rule" />
      </div>
      <h2 className="font-display text-lg font-bold uppercase tracking-[0.4em] text-amber-400 sm:text-xl">
        {t.label}
      </h2>
      <p className="mx-auto mt-4 max-w-md text-base italic text-stone-400">{t.tagline}</p>
      <div className="mx-auto mt-6 w-16">
        <div className="gold-rule" />
      </div>
    </div>
  )
}

function AwardSlide({ category }: { category: Category }) {
  const { winner, nominees, quote } = category
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="text-5xl">{category.emoji}</div>
      <h2 className="gold-text mt-3 font-display text-3xl font-bold tracking-wide sm:text-4xl">
        {category.title}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm italic text-stone-400">{category.blurb}</p>
      {category.presenter && (
        <p className="mx-auto mt-3 max-w-lg text-[0.95rem] text-stone-300">“{category.presenter}”</p>
      )}

      <div className="mt-8 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-b from-velvet-light to-velvet text-left shadow-[0_0_40px_-12px_rgba(212,175,55,0.4)]">
        <div className="flex flex-col items-center gap-5 p-7 sm:flex-row sm:items-stretch">
          <div className="flex shrink-0 items-center justify-center sm:w-16">
            <Statuette className="shimmer h-16 w-16" />
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
              <blockquote className="mt-4 border-l-2 border-amber-500/40 pl-4 italic text-stone-300">
                “{quote.text}”
                <footer className="mt-1 text-sm not-italic text-stone-500">— {quote.author}</footer>
              </blockquote>
            )}
          </div>
        </div>
      </div>

      {nominees.length > 0 && (
        <p className="mx-auto mt-5 max-w-lg text-sm text-stone-500">
          <span className="uppercase tracking-[0.2em] text-stone-600">Also nominated · </span>
          {nominees.map((n, i) => (
            <span key={`${n.url}-${i}`}>
              {i > 0 && ' · '}
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-stone-400 transition-colors hover:text-amber-300"
              >
                {n.teamName}
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

function SuperlativesSlide({ items }: { items: Superlative[] }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <div className="text-4xl">🎟️</div>
      <h2 className="gold-text mt-3 font-display text-3xl font-bold tracking-wide sm:text-4xl">
        The Superlatives
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm italic text-stone-400">
        A little something for everyone — every team that builds in the open earns a curtain call.
      </p>
      <ul className="mx-auto mt-8 grid max-w-2xl gap-3 text-left sm:grid-cols-2">
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
    </div>
  )
}

function OutroSlide({ show, onReplay }: { show: AwardsShow; onReplay: () => void }) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <Statuette className="shimmer mx-auto h-32 w-32" />
      <h2 className="gold-text mt-6 font-display text-4xl font-black tracking-tight sm:text-5xl">
        That's a wrap.
      </h2>
      {show.stats.teamsCelebrated > 0 && (
        <p className="mt-5 font-display text-xl text-amber-200">
          🎉 {show.stats.teamsCelebrated} different teams took home an honor tonight.
        </p>
      )}
      <p className="mx-auto mt-4 max-w-md text-stone-300">
        Made with admiration for every team that built in the open. Data harvested from{' '}
        <a
          href="https://www.chiefdelphi.com/c/first/open-alliance/89"
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-300 underline-offset-4 hover:underline"
        >
          Chief Delphi · Open Alliance
        </a>
        .
      </p>
      <button
        onClick={onReplay}
        className="mt-9 rounded-full border border-amber-500/40 px-6 py-2 text-sm uppercase tracking-[0.25em] text-amber-300 transition-colors hover:bg-amber-500/10"
      >
        Replay from the top ↺
      </button>
      <p className="mx-auto mt-8 max-w-md text-xs text-stone-600">
        A fan-made parody. Not affiliated with FIRST, Chief Delphi, or the Academy of anything.
      </p>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="gold-text font-display text-3xl font-bold sm:text-4xl">{fmt(value)}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.25em] text-stone-400">{label}</div>
    </div>
  )
}
