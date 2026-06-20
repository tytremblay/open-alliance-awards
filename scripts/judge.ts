// Turn data/raw-2026.json into data/awards-2026.json.
//   npm run judge
//
// Inclusion-first design: FRC is about lifting everyone up, so the ceremony is
// built to celebrate as many distinct teams as possible.
//   - Marquee awards honor the genuinely popular threads (likes / views / posts),
//     but a team can win at most ONE award all night (global winner dedupe).
//   - Spotlight awards use relative/quality metrics so smaller, quieter teams win.
//   - Juried (AI) awards judge only teams not already honored.
//   - A "superlatives" wall hands out ~20 more one-line shout-outs, all distinct teams.
//
// Metric + superlative awards need no API key. Juried awards run only if
// ANTHROPIC_API_KEY is set.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import type { AwardsShow, Category, Nominee, Superlative, Tier } from '../src/types.ts'

const SEASON = 2026
const MODEL = 'claude-opus-4-8'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(ROOT, 'data', `raw-${SEASON}.json`)
const OUT = join(ROOT, 'data', `awards-${SEASON}.json`)
const SEASON_END = '2026-06-01T00:00:00Z' // fixed "now" so reruns are deterministic

// ---- raw data shape (mirror of harvest output) ----
interface RawPost {
  id: number
  post_number: number
  username: string
  name: string
  created_at: string
  score: number
  reads: number
  likes: number
  cooked: string
}
interface RawThread {
  id: number
  title: string
  slug: string
  url: string
  team: number | null
  posts_count: number
  reply_count: number
  views: number
  like_count: number
  op_like_count: number
  created_at: string
  last_posted_at: string
  tags: string[]
  posts: RawPost[]
}
interface RawData {
  season: number
  harvestedAt: string
  threads: RawThread[]
}

// ---- text / media helpers ----

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
const count = (html: string, re: RegExp) => (html.match(re) || []).length

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const daysSince = (iso: string) =>
  Math.max(1, (Date.parse(SEASON_END) - Date.parse(iso)) / 86_400_000)
const dateStr = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** Short display name for a team/thread. */
function teamName(t: RawThread): string {
  const s = t.title
    .replace(/\s*\|\s*(open alliance|build (thread|blog|log)).*/i, '')
    .replace(/\s*[-–|]\s*\d{4}.*/i, '')
    .replace(/\b20(2[0-9])\b/g, '')
    .replace(/open alliance/i, '')
    .replace(/build (thread|blog|log)/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[|\-–]\s*$/, '')
    .trim()
  return s || t.title
}

/** Stable identity for dedupe — team number when known, else the thread id. */
const teamKey = (t: RawThread) => (t.team != null ? `#${t.team}` : `t:${t.id}`)

/**
 * The Open Alliance category also holds directory, help, and announcement
 * threads. Keep only genuine team build blogs so awards celebrate real teams.
 */
function isBuildThread(t: RawThread): boolean {
  if (t.team == null) return false
  const taggedBuild = t.tags.some((tag) => /openalliance|build-blog|build-thread/i.test(tag))
  const titledBuild = /build\s*(thread|blog|log)|open\s*alliance/i.test(t.title)
  return taggedBuild || titledBuild
}

function nominee(t: RawThread, stat: string, citation: string): Nominee {
  return { team: t.team, teamName: teamName(t), threadTitle: t.title, url: t.url, citation, stat }
}

// ---- generic metric award (respects the global "honored" set) ----

interface AwardSpec {
  key: string
  title: string
  emoji: string
  blurb: string
  presenter: string
  tier: Tier
  pool: RawThread[]
  value: (t: RawThread) => number
  stat: (t: RawThread) => string
  citation: (t: RawThread, rank: number) => string
  /** Skip already-honored teams when choosing nominees too (spreads recognition further). */
  nomineesSkipHonored: boolean
}

function buildAward(spec: AwardSpec, honored: Set<string>): Category | null {
  const ranked = [...spec.pool]
    .filter((t) => spec.value(t) > 0)
    .sort((a, b) => spec.value(b) - spec.value(a))

  const win = ranked.find((t) => !honored.has(teamKey(t)))
  if (!win) return null
  honored.add(teamKey(win))

  const noms: RawThread[] = []
  for (const t of ranked) {
    if (t === win) continue
    if (spec.nomineesSkipHonored && honored.has(teamKey(t))) continue
    if (noms.some((n) => teamKey(n) === teamKey(t))) continue
    noms.push(t)
    if (noms.length === 3) break
  }

  return {
    key: spec.key,
    title: spec.title,
    emoji: spec.emoji,
    blurb: spec.blurb,
    method: 'metric',
    tier: spec.tier,
    presenter: spec.presenter,
    winner: nominee(win, spec.stat(win), spec.citation(win, 0)),
    nominees: noms.map((t, i) => nominee(t, spec.stat(t), spec.citation(t, i + 1))),
  }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

// ---- marquee + spotlight awards ----

function buildMetricAwards(threads: RawThread[], honored: Set<string>): Category[] {
  const cats: Category[] = []
  const add = (c: Category | null) => c && cats.push(c)

  // ---------- Marquee (popularity; winner dedupe spreads the wealth) ----------
  add(
    buildAward(
      {
        key: 'best-picture',
        title: 'Best Picture',
        emoji: '🏆',
        blurb: 'The build thread the community loved most, by total likes.',
        presenter: 'The envelope, please. For sheer, sustained adoration across an entire season…',
        tier: 'marquee',
        pool: threads,
        value: (t) => t.like_count,
        stat: (t) => `${fmt(t.like_count)} likes`,
        citation: () => 'The most-liked build thread of the season.',
        nomineesSkipHonored: true,
      },
      honored,
    ),
  )
  add(
    buildAward(
      {
        key: 'audience-award',
        title: 'Audience Award',
        emoji: '👀',
        blurb: 'A build thread the whole community kept coming back to.',
        presenter: 'This one played to a packed house all season long…',
        tier: 'marquee',
        pool: threads,
        value: (t) => t.views,
        stat: (t) => `${fmt(t.views)} views`,
        citation: () => 'One of the most-watched build threads of the season.',
        nomineesSkipHonored: true,
      },
      honored,
    ),
  )
  add(
    buildAward(
      {
        key: 'talkative-ensemble',
        title: 'Most Talkative Ensemble',
        emoji: '💬',
        blurb: 'The thread that simply would not stop talking, by post count.',
        presenter: 'For a cast that never met a silence it could not fill…',
        tier: 'marquee',
        pool: threads,
        value: (t) => t.posts_count,
        stat: (t) => `${fmt(t.posts_count)} posts`,
        citation: () => 'One of the most active build threads of the season.',
        nomineesSkipHonored: true,
      },
      honored,
    ),
  )

  // People's Choice — single most-liked post, by a team not yet honored.
  const postsFlat = threads.flatMap((t) => t.posts.map((p) => ({ t, p })))
  postsFlat.sort((a, b) => b.p.likes - a.p.likes)
  const pcWin = postsFlat.find((x) => !honored.has(teamKey(x.t)) && x.p.likes > 0)
  if (pcWin) {
    honored.add(teamKey(pcWin.t))
    const pcNoms = postsFlat
      .filter((x) => x !== pcWin && !honored.has(teamKey(x.t)))
      .filter((x, i, arr) => arr.findIndex((y) => teamKey(y.t) === teamKey(x.t)) === i)
      .slice(0, 3)
    const postNominee = (x: { t: RawThread; p: RawPost }): Nominee => ({
      team: x.t.team,
      teamName: teamName(x.t),
      threadTitle: x.t.title,
      url: `${x.t.url}/${x.p.post_number}`,
      citation: `A single post by ${x.p.name || x.p.username} that the room adored.`,
      stat: `${fmt(x.p.likes)} likes`,
    })
    cats.push({
      key: 'peoples-choice',
      title: "People's Choice",
      emoji: '❤️',
      blurb: 'One of the most-liked single posts of the whole season.',
      method: 'metric',
      tier: 'marquee',
      presenter: 'One post. One moment. The whole crowd on its feet…',
      winner: postNominee(pcWin),
      nominees: pcNoms.map(postNominee),
    })
  }

  // ---------- Spotlight (relative/quality; designed so smaller teams win) ----------
  const viewMedian = median(threads.map((t) => t.views))
  // Word-boundaried on both ends to avoid false hits like "Indiana" → "India".
  const COUNTRY =
    /\b(canada|canadian|ontario|qu[eé]bec|alberta|israel|israeli|brazil|brasil|brazilian|m[eé]xico|mexican|turkey|t[uü]rkiye|turkish|australia|australian|india|chinese|netherlands|dutch|holland|germany|german|france|french|italy|italian|spain|spanish|sweden|swedish|norway|denmark|poland|polish|chile|colombia|peru|singapore|taiwan|indonesia|philippines)\b/i
  const isInternational = (t: RawThread) =>
    t.tags.some((tag) => /canada|israel|brazil|mexico|australia|europe/i.test(tag)) ||
    COUNTRY.test(t.title) ||
    (t.posts[0] ? COUNTRY.test(stripHtml(t.posts[0].cooked).slice(0, 600)) : false)

  add(
    buildAward(
      {
        key: 'rookie-spotlight',
        title: 'Rookie / Newcomer Spotlight',
        emoji: '🌱',
        blurb: 'The standout build log from a newer team (a recent rookie class).',
        presenter: 'Everyone starts somewhere — and some starts are dazzling…',
        tier: 'spotlight',
        pool: threads.filter((t) => t.team != null && t.team >= 9000),
        value: (t) => t.like_count + t.posts_count * 2,
        stat: (t) => `${fmt(t.like_count)} likes · ${fmt(t.posts_count)} posts`,
        citation: () => 'A newer team that showed up and showed out.',
        nomineesSkipHonored: true,
      },
      honored,
    ),
  )
  add(
    buildAward(
      {
        key: 'hidden-gem',
        title: 'Hidden Gem',
        emoji: '💎',
        blurb: 'A thread the crowd has not found yet — lots of love, modest traffic.',
        presenter: 'Criminally under-watched, and absolutely worth your time…',
        tier: 'spotlight',
        pool: threads.filter((t) => t.views > 0 && t.views < viewMedian && t.posts_count >= 4),
        value: (t) => t.like_count,
        stat: (t) => `${fmt(t.like_count)} likes · only ${fmt(t.views)} views`,
        citation: () => 'Earned outsized love despite a quiet audience.',
        nomineesSkipHonored: true,
      },
      honored,
    ),
  )
  add(
    buildAward(
      {
        key: 'quality-over-quantity',
        title: 'Quality Over Quantity',
        emoji: '🎯',
        blurb: 'Highest average likes per post — every post landed.',
        presenter: 'They did not post the most. They posted the best…',
        tier: 'spotlight',
        pool: threads.filter((t) => t.posts_count >= 15),
        value: (t) => t.like_count / t.posts_count,
        stat: (t) => `${(t.like_count / t.posts_count).toFixed(1)} likes/post`,
        citation: () => 'Made every single post count.',
        nomineesSkipHonored: true,
      },
      honored,
    ),
  )
  add(
    buildAward(
      {
        key: 'best-opening-night',
        title: 'Best Opening Night',
        emoji: '🚀',
        blurb: 'The strongest debut — the most-liked opening post of the season.',
        presenter: 'You only get one first impression. This one stuck the landing…',
        tier: 'spotlight',
        pool: threads,
        value: (t) => t.op_like_count,
        stat: (t) => `${fmt(t.op_like_count)} likes on the opener`,
        citation: () => 'Opened the season with a showstopper of a first post.',
        nomineesSkipHonored: true,
      },
      honored,
    ),
  )
  add(
    buildAward(
      {
        key: 'around-the-world',
        title: 'Around the World',
        emoji: '🌍',
        blurb: 'Celebrating the global reach of the Open Alliance.',
        presenter: 'FRC is a worldwide family — tonight we send our love abroad…',
        tier: 'spotlight',
        pool: threads.filter(isInternational),
        value: (t) => t.like_count + t.posts_count,
        stat: (t) => `${fmt(t.like_count)} likes`,
        citation: () => 'Flying the flag for FRC teams around the globe.',
        nomineesSkipHonored: true,
      },
      honored,
    ),
  )

  return cats
}

// ---- superlatives wall ----

interface Agg {
  t: RawThread
  nightPosts: number
  maxPostLen: number
  opLen: number
  images: number
  videos: number
  links: number
  spanDays: number
  distinctDays: number
  maxDayPosts: number
  hot7: number
  topAuthorPosts: number
  titleEmojis: number
  opImages: number
  avgPostLen: number
}

const EMOJI = /\p{Extended_Pictographic}/gu

function aggregate(t: RawThread): Agg {
  const created = Date.parse(t.created_at)
  const byDay = new Map<string, number>()
  const byAuthor = new Map<string, number>()
  let night = 0
  let maxPostLen = 0
  let images = 0
  let videos = 0
  let links = 0
  let hot7 = 0
  let totalLen = 0
  for (const p of t.posts) {
    const len = stripHtml(p.cooked).length
    totalLen += len
    maxPostLen = Math.max(maxPostLen, len)
    images += count(p.cooked, /<img\b/gi)
    videos += count(p.cooked, /<(iframe|video)\b/gi)
    links += count(p.cooked, /<a\b/gi)
    const d = new Date(p.created_at)
    const h = d.getUTCHours()
    if (h >= 0 && h < 6) night++
    byDay.set(p.created_at.slice(0, 10), (byDay.get(p.created_at.slice(0, 10)) || 0) + 1)
    byAuthor.set(p.username, (byAuthor.get(p.username) || 0) + 1)
    if (Date.parse(p.created_at) - created <= 7 * 86_400_000) hot7 += p.likes
  }
  const op = t.posts[0]
  return {
    t,
    nightPosts: night,
    maxPostLen,
    opLen: op ? stripHtml(op.cooked).length : 0,
    images,
    videos,
    links,
    spanDays: (Date.parse(t.last_posted_at) - created) / 86_400_000,
    distinctDays: byDay.size,
    maxDayPosts: Math.max(0, ...byDay.values()),
    hot7,
    topAuthorPosts: Math.max(0, ...byAuthor.values()),
    titleEmojis: (t.title.match(EMOJI) || []).length,
    opImages: op ? count(op.cooked, /<img\b/gi) : 0,
    avgPostLen: t.posts.length ? totalLen / t.posts.length : 0,
  }
}

interface SuperSpec {
  emoji: string
  title: string
  value: (a: Agg) => number
  eligible?: (a: Agg) => boolean
  line: (a: Agg) => string
}

const SUPERLATIVES: SuperSpec[] = [
  { emoji: '🦉', title: 'Burning the Midnight Oil', value: (a) => a.nightPosts, line: (a) => `${a.nightPosts} posts dropped in the small hours.` },
  { emoji: '📚', title: 'The Novelist', value: (a) => a.maxPostLen, line: (a) => `A single post ran ${fmt(a.maxPostLen)} characters.` },
  { emoji: '📷', title: 'Shutterbug', value: (a) => a.images, line: (a) => `${fmt(a.images)} photos across the build log.` },
  { emoji: '🎬', title: "Director's Cut", value: (a) => a.videos, line: (a) => `${a.videos} videos rolled this season.` },
  { emoji: '🔗', title: 'The Link Librarian', value: (a) => a.links, line: (a) => `${fmt(a.links)} links shared with the community.` },
  { emoji: '🧵', title: 'The Long Haul', value: (a) => a.spanDays, line: (a) => `Kept the thread alive ${Math.round(a.spanDays)} days, start to finish.` },
  { emoji: '🌅', title: 'First to the Party', value: (a) => -Date.parse(a.t.created_at), line: (a) => `Opened the season early, on ${dateStr(a.t.created_at)}.` },
  { emoji: '🦋', title: 'Fashionably Late', value: (a) => Date.parse(a.t.created_at), line: (a) => `Made a grand entrance on ${dateStr(a.t.created_at)}.` },
  { emoji: '📈', title: 'The Steady Hand', value: (a) => a.distinctDays, line: (a) => `Posted on ${a.distinctDays} different days. Consistency!` },
  { emoji: '🎤', title: 'The Opening Monologue', value: (a) => a.opLen, line: (a) => `An opening post of ${fmt(a.opLen)} characters.` },
  { emoji: '🏷️', title: 'The Tag Collector', value: (a) => a.t.tags.length, line: (a) => `Filed under ${a.t.tags.length} different tags.` },
  { emoji: '⚡', title: 'Rapid Fire', value: (a) => a.maxDayPosts, line: (a) => `${a.maxDayPosts} posts in a single day.` },
  { emoji: '💬', title: 'The Conversation Starter', value: (a) => a.t.reply_count, line: (a) => `Sparked ${fmt(a.t.reply_count)} replies.` },
  { emoji: '🔥', title: 'Hot Start', value: (a) => a.hot7, line: (a) => `${fmt(a.hot7)} likes in the first week alone.` },
  { emoji: '✍️', title: 'The Prolific Pen', value: (a) => a.topAuthorPosts, line: (a) => `One member posted ${a.topAuthorPosts} times.` },
  { emoji: '😀', title: 'Emoji Enthusiast', value: (a) => a.titleEmojis, eligible: (a) => a.titleEmojis >= 2, line: (a) => `Packed ${a.titleEmojis} emoji into the thread title.` },
  { emoji: '🎨', title: 'The Renderer', value: (a) => a.opImages, line: (a) => `${a.opImages} images in the opening post — a visual feast.` },
  { emoji: '🗜️', title: 'Brevity Is Wit', value: (a) => -a.avgPostLen, eligible: (a) => a.t.posts.length >= 10, line: (a) => `Said it all in ~${Math.round(a.avgPostLen)} characters a post.` },
  { emoji: '👀', title: 'Best Read', value: (a) => a.t.views / Math.max(1, a.t.posts_count), line: (a) => `${fmt(a.t.views / Math.max(1, a.t.posts_count))} views per post.` },
]

function buildSuperlatives(threads: RawThread[], honored: Set<string>): Superlative[] {
  const aggs = threads.filter((t) => t.posts.length > 0).map(aggregate)
  const used = new Set<string>()
  const out: Superlative[] = []

  for (const spec of SUPERLATIVES) {
    const ranked = aggs
      .filter((a) => (spec.eligible ? spec.eligible(a) : true) && spec.value(a) > -Infinity)
      .sort((a, b) => spec.value(b) - spec.value(a))
    // Prefer a team honored by no award and no prior superlative; fall back to
    // any not-yet-superlative team so every superlative finds a home.
    const pick =
      ranked.find((a) => !honored.has(teamKey(a.t)) && !used.has(teamKey(a.t))) ||
      ranked.find((a) => !used.has(teamKey(a.t)))
    if (!pick || spec.value(pick) <= 0) continue
    used.add(teamKey(pick.t))
    honored.add(teamKey(pick.t))
    out.push({
      emoji: spec.emoji,
      title: spec.title,
      team: pick.t.team,
      teamName: teamName(pick.t),
      url: pick.t.url,
      line: spec.line(pick),
    })
  }
  return out
}

// ---- AI (juried) awards ----

interface AiAward {
  key: string
  title: string
  emoji: string
  blurb: string
  criterion: string
}

const AI_AWARDS: AiAward[] = [
  { key: 'best-screenplay', title: 'Best Original Screenplay', emoji: '✍️', blurb: 'The best writing and storytelling in a build log.', criterion: 'the most engaging, well-written, genuinely fun-to-read build log — voice, narrative, and clarity' },
  { key: 'engineering-deep-dive', title: 'Best Engineering Deep-Dive', emoji: '🔧', blurb: 'The most impressive technical breakdown of the season.', criterion: 'the most impressive, detailed, and educational engineering explanation (design tradeoffs, analysis, CAD, code)' },
  { key: 'best-cinematography', title: 'Best Cinematography', emoji: '🎥', blurb: 'The best use of photos, CAD renders, and video.', criterion: 'the best visual storytelling — strong use of photos, CAD renders, and video to show the robot coming together' },
  { key: 'best-comedy', title: 'Best Comedic Moment', emoji: '😂', blurb: 'The funniest, most good-natured moment of the season.', criterion: 'the funniest, most charming, good-natured moment or running joke (keep it kind and celebratory)' },
  { key: 'best-comeback', title: 'Best Comeback', emoji: '🦾', blurb: 'The best recovery-from-disaster arc.', criterion: 'the best recovery-from-adversity arc — a broken part, a failed strategy, or a rough event turned around' },
  { key: 'most-helpful', title: 'Best Supporting Team', emoji: '🤝', blurb: 'The team that gave most generously back to the community.', criterion: 'the most generous, helpful, community-minded team — sharing resources, answering questions, helping others (the heart of Open Alliance)' },
]

function buildDigest(threads: RawThread[], honored: Set<string>, limit = 26): { digest: string; pool: RawThread[] } {
  const score = (t: RawThread) => t.like_count * 2 + t.views / 100 + t.posts_count * 3
  const pool = threads
    .filter((t) => !honored.has(teamKey(t)) && t.posts.length > 0)
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit)

  const digest = pool
    .map((t) => {
      const op = t.posts[0]
      let images = 0
      let videos = 0
      for (const p of t.posts) {
        images += count(p.cooked, /<img\b/gi)
        videos += count(p.cooked, /<(iframe|video)\b/gi)
      }
      const highlights = [...t.posts]
        .filter((p) => p.post_number > 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map((p) => `    - [#${p.post_number} by ${p.name || p.username}, ${p.likes} likes]: ${stripHtml(p.cooked).slice(0, 280)}`)
        .join('\n')
      return [
        `### ${teamName(t)}${t.team ? ` (Team ${t.team})` : ''}`,
        `Title: ${t.title}`,
        `Stats: ${fmt(t.like_count)} likes, ${fmt(t.views)} views, ${t.posts_count} posts, ${images} images, ${videos} videos`,
        `Opening post: ${op ? stripHtml(op.cooked).slice(0, 700) : '(none)'}`,
        highlights ? `Notable posts:\n${highlights}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')

  return { digest, pool }
}

const AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    winner_team_name: { type: 'string', description: 'The exact team/thread name (the ### heading) of the winner' },
    winner_citation: { type: 'string', description: 'One witty, celebratory sentence on why they won' },
    quote: { type: 'string', description: 'A short verbatim pull-quote from this thread (1-2 sentences)' },
    quote_author: { type: 'string', description: 'Who wrote the quote' },
    presenter: { type: 'string', description: 'A short tongue-in-cheek line a presenter would read on stage' },
    nominees: {
      type: 'array',
      description: 'Exactly 3 runner-up team/thread names, with a short reason each',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { team_name: { type: 'string' }, citation: { type: 'string' } },
        required: ['team_name', 'citation'],
      },
    },
  },
  required: ['winner_team_name', 'winner_citation', 'quote', 'quote_author', 'presenter', 'nominees'],
} as const

interface AiResult {
  winner_team_name: string
  winner_citation: string
  quote: string
  quote_author: string
  presenter: string
  nominees: { team_name: string; citation: string }[]
}

async function judgeAiAward(
  client: Anthropic,
  award: AiAward,
  threads: RawThread[],
  honored: Set<string>,
): Promise<Category | null> {
  // Build the candidate pool fresh each time so prior AI winners are excluded too.
  const { digest, pool } = buildDigest(threads, honored)
  if (pool.length === 0) return null

  const system =
    'You are a witty but warm-hearted awards judge for "The Open Alliance Awards," a tongue-in-cheek Oscars parody for FRC (FIRST Robotics Competition) team build threads. ' +
    'These are real student teams — celebrate them. Be playful and funny about the ceremony, never mean about the people. ' +
    'FRC values inclusion: you are shown teams that have NOT yet won anything tonight, so spread recognition and look for deserving smaller teams, not just the obvious giants. ' +
    'Pick exactly one winner and three runners-up. Use the exact team/thread names from the "###" headings. Pull a real, verbatim quote from the winning thread.'

  const userMsg =
    `Award: ${award.title} — ${award.emoji}\n` +
    `Pick the thread that best represents: ${award.criterion}.\n\n` +
    `Candidates (none have won an award yet tonight):\n\n${digest}`

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system,
    tools: [
      {
        name: 'submit_award',
        description: 'Submit the winner, runners-up, quote, and presenter line for this award.',
        input_schema: AI_SCHEMA as Anthropic.Tool['input_schema'],
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_award' },
    messages: [{ role: 'user', content: userMsg }],
  })

  const toolUse = resp.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    console.warn(`  ${award.title}: no tool_use in response (stop=${resp.stop_reason})`)
    return null
  }
  const r = toolUse.input as AiResult

  const byName = new Map(pool.map((t) => [teamName(t).toLowerCase(), t]))
  const resolve = (name: string): RawThread | undefined => {
    const key = name.toLowerCase()
    return (
      byName.get(key) ||
      pool.find((t) => teamName(t).toLowerCase().includes(key) || key.includes(teamName(t).toLowerCase())) ||
      pool.find((t) => t.title.toLowerCase().includes(key))
    )
  }

  const winT = resolve(r.winner_team_name)
  if (!winT) {
    console.warn(`  ${award.title}: winner "${r.winner_team_name}" not found in pool`)
    return null
  }
  honored.add(teamKey(winT))

  const winner = nominee(winT, '', r.winner_citation)
  const nominees: Nominee[] = r.nominees
    .map((n) => {
      const t = resolve(n.team_name)
      return t ? nominee(t, '', n.citation) : null
    })
    .filter((n): n is Nominee => n !== null)

  return {
    key: award.key,
    title: award.title,
    emoji: award.emoji,
    blurb: award.blurb,
    method: 'ai',
    tier: 'juried',
    presenter: r.presenter,
    winner,
    quote: { text: r.quote, author: r.quote_author, url: winT.url },
    nominees,
  }
}

// ---- main ----

async function main() {
  const data: RawData = JSON.parse(await readFile(RAW, 'utf8'))
  const threads = data.threads.filter((t) => t.posts_count > 0 && isBuildThread(t))
  console.log(`Loaded ${threads.length} build threads (of ${data.threads.length} total).`)

  const honored = new Set<string>()
  const categories: Category[] = buildMetricAwards(threads, honored)
  console.log(`Computed ${categories.length} metric awards (marquee + spotlight).`)

  if (process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic()
    console.log(`Judging ${AI_AWARDS.length} juried awards with ${MODEL} (excluding already-honored teams)…`)
    for (const award of AI_AWARDS) {
      try {
        const cat = await judgeAiAward(client, award, threads, honored)
        if (cat) {
          categories.push(cat)
          console.log(`  ✓ ${award.title} → ${cat.winner.teamName}`)
        }
      } catch (err) {
        console.warn(`  ✗ ${award.title}: ${String(err)}`)
      }
    }
  } else {
    console.warn(
      '\nANTHROPIC_API_KEY not set — skipping juried (AI) awards.\n' +
        'Set it (e.g. in .env or `export ANTHROPIC_API_KEY=...`) and re-run `npm run judge` for the full ceremony.\n',
    )
  }

  const superlatives = buildSuperlatives(threads, honored)
  console.log(`Handed out ${superlatives.length} superlatives.`)

  const show: AwardsShow = {
    season: SEASON,
    generatedAt: new Date().toISOString(),
    stats: {
      threads: threads.length,
      posts: threads.reduce((n, t) => n + t.posts.length, 0),
      totalLikes: threads.reduce((n, t) => n + t.like_count, 0),
      totalViews: threads.reduce((n, t) => n + t.views, 0),
      teamsCelebrated: honored.size,
    },
    categories,
    superlatives,
  }

  await writeFile(OUT, JSON.stringify(show, null, 2))
  console.log(`\nWrote ${OUT}`)
  console.log(`  ${categories.length} awards + ${superlatives.length} superlatives → ${honored.size} distinct teams celebrated.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
