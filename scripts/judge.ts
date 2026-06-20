// Turn data/raw-2026.json into data/awards-2026.json.
//   npm run judge
// Metric awards are computed from engagement numbers (no API key needed).
// AI-judged awards read post content via Claude — they run only if ANTHROPIC_API_KEY is set.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import type { AwardsShow, Category, Nominee } from '../src/types.ts'

const SEASON = 2026
const MODEL = 'claude-opus-4-8'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(ROOT, 'data', `raw-${SEASON}.json`)
const OUT = join(ROOT, 'data', `awards-${SEASON}.json`)

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

// ---- helpers ----

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

function mediaCount(html: string) {
  return {
    images: (html.match(/<img\b/gi) || []).length,
    videos: (html.match(/<(iframe|video)\b/gi) || []).length,
    links: (html.match(/<a\b/gi) || []).length,
  }
}

const fmt = (n: number) => n.toLocaleString('en-US')
const daysSince = (iso: string) =>
  Math.max(1, (Date.parse(SEASON_END) - Date.parse(iso)) / 86_400_000)
// Reference "now" for engagement-per-day — fixed so reruns are deterministic.
const SEASON_END = '2026-06-01T00:00:00Z'

/** Short display name for a team/thread. */
function teamName(t: RawThread): string {
  let s = t.title
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

function nominee(t: RawThread, stat: string, citation: string): Nominee {
  return {
    team: t.team,
    teamName: teamName(t),
    threadTitle: t.title,
    url: t.url,
    citation,
    stat,
  }
}

// ---- metric awards ----

function metricCategory(
  key: string,
  title: string,
  emoji: string,
  blurb: string,
  presenter: string,
  threads: RawThread[],
  value: (t: RawThread) => number,
  statLabel: (t: RawThread) => string,
  citation: (t: RawThread, rank: number) => string,
): Category {
  const ranked = [...threads].sort((a, b) => value(b) - value(a)).slice(0, 5)
  const [win, ...noms] = ranked
  return {
    key,
    title,
    emoji,
    blurb,
    method: 'metric',
    presenter,
    winner: nominee(win, statLabel(win), citation(win, 0)),
    nominees: noms.map((t, i) => nominee(t, statLabel(t), citation(t, i + 1))),
  }
}

function buildMetricAwards(threads: RawThread[]): Category[] {
  const cats: Category[] = []

  cats.push(
    metricCategory(
      'best-picture',
      'Best Picture',
      '🏆',
      'The build thread the community loved most, by total likes.',
      'The envelope please. For sheer, sustained adoration across an entire season…',
      threads,
      (t) => t.like_count,
      (t) => `${fmt(t.like_count)} likes`,
      () => 'Most-liked build thread of the season.',
    ),
  )

  cats.push(
    metricCategory(
      'audience-award',
      'Audience Award',
      '👀',
      'The thread the most eyeballs could not stop watching, by total views.',
      'This one played to a packed house all season long…',
      threads,
      (t) => t.views,
      (t) => `${fmt(t.views)} views`,
      () => 'Most-viewed build thread of the season.',
    ),
  )

  cats.push(
    metricCategory(
      'talkative-ensemble',
      'Most Talkative Ensemble',
      '💬',
      'The thread that simply would not stop talking, by post count.',
      'For a cast that never met a silence it could not fill…',
      threads,
      (t) => t.posts_count,
      (t) => `${fmt(t.posts_count)} posts`,
      () => 'Highest post count of the season.',
    ),
  )

  cats.push(
    metricCategory(
      'box-office-smash',
      'Box Office Smash',
      '📈',
      'Fastest to win hearts — the best likes-per-day since opening night.',
      'Opened big and never cooled off…',
      threads.filter((t) => t.like_count >= 20),
      (t) => t.like_count / daysSince(t.created_at),
      (t) => `${(t.like_count / daysSince(t.created_at)).toFixed(1)} likes/day`,
      () => 'Best engagement-per-day since the thread opened.',
    ),
  )

  // People's Choice — single most-liked post across all threads.
  const postsFlat = threads.flatMap((t) =>
    t.posts.map((p) => ({ t, p })),
  )
  const topPosts = postsFlat.sort((a, b) => b.p.likes - a.p.likes).slice(0, 5)
  const [pcWin, ...pcNoms] = topPosts
  const postNominee = (x: { t: RawThread; p: RawPost }): Nominee => ({
    team: x.t.team,
    teamName: x.p.name || x.p.username,
    threadTitle: x.t.title,
    url: `${x.t.url}/${x.p.post_number}`,
    citation: `A single post by ${x.p.name || x.p.username} in “${teamName(x.t)}”.`,
    stat: `${fmt(x.p.likes)} likes`,
  })
  cats.push({
    key: 'peoples-choice',
    title: "People's Choice",
    emoji: '❤️',
    blurb: 'The single most-liked post of the entire season.',
    method: 'metric',
    presenter: 'One post. One moment. The whole crowd on its feet…',
    winner: postNominee(pcWin),
    nominees: pcNoms.map(postNominee),
  })

  return cats
}

// ---- AI awards ----

interface AiAward {
  key: string
  title: string
  emoji: string
  blurb: string
  criterion: string
}

const AI_AWARDS: AiAward[] = [
  {
    key: 'best-screenplay',
    title: 'Best Original Screenplay',
    emoji: '✍️',
    blurb: 'The best writing and storytelling in a build log.',
    criterion:
      'the most engaging, well-written, genuinely fun-to-read build log — voice, narrative, and clarity',
  },
  {
    key: 'engineering-deep-dive',
    title: 'Best Engineering Deep-Dive',
    emoji: '🔧',
    blurb: 'The most impressive technical breakdown of the season.',
    criterion:
      'the most impressive, detailed, and educational engineering explanation (design tradeoffs, analysis, CAD, code)',
  },
  {
    key: 'best-cinematography',
    title: 'Best Cinematography',
    emoji: '🎥',
    blurb: 'The best use of photos, CAD renders, and video.',
    criterion:
      'the best visual storytelling — strong use of photos, CAD renders, and video to show the robot coming together',
  },
  {
    key: 'best-comedy',
    title: 'Best Comedic Moment',
    emoji: '😂',
    blurb: 'The funniest, most good-natured moment of the season.',
    criterion:
      'the funniest, most charming, good-natured moment or running joke (keep it kind and celebratory)',
  },
  {
    key: 'best-comeback',
    title: 'Best Comeback',
    emoji: '🦾',
    blurb: 'The best recovery-from-disaster arc.',
    criterion:
      'the best recovery-from-adversity arc — a broken part, a failed strategy, or a rough event turned around',
  },
  {
    key: 'lifetime-achievement',
    title: 'Lifetime-of-the-Season Achievement',
    emoji: '🌟',
    blurb: 'The most consistent, sustained excellence all season.',
    criterion:
      'the most consistent sustained excellence across the whole season — a team that showed up and delivered week after week',
  },
]

/** Build a compact candidate digest for the LLM from the top threads. */
function buildDigest(threads: RawThread[], limit = 24): { digest: string; pool: RawThread[] } {
  const score = (t: RawThread) =>
    t.like_count * 2 + t.views / 100 + t.posts_count * 3
  const pool = [...threads].sort((a, b) => score(b) - score(a)).slice(0, limit)

  const digest = pool
    .map((t) => {
      const op = t.posts[0]
      const media = t.posts.reduce(
        (acc, p) => {
          const m = mediaCount(p.cooked)
          acc.images += m.images
          acc.videos += m.videos
          return acc
        },
        { images: 0, videos: 0 },
      )
      const highlights = [...t.posts]
        .filter((p) => p.post_number > 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map(
          (p) =>
            `    - [#${p.post_number} by ${p.name || p.username}, ${p.likes} likes]: ${stripHtml(
              p.cooked,
            ).slice(0, 280)}`,
        )
        .join('\n')
      return [
        `### ${teamName(t)}${t.team ? ` (Team ${t.team})` : ''}`,
        `Title: ${t.title}`,
        `Stats: ${fmt(t.like_count)} likes, ${fmt(t.views)} views, ${t.posts_count} posts, ${media.images} images, ${media.videos} videos`,
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
    winner_team_name: {
      type: 'string',
      description: 'The exact team/thread name (the ### heading) of the winner',
    },
    winner_citation: {
      type: 'string',
      description: 'One witty, celebratory sentence on why they won',
    },
    quote: {
      type: 'string',
      description: 'A short verbatim pull-quote from this thread (1-2 sentences)',
    },
    quote_author: { type: 'string', description: 'Who wrote the quote' },
    presenter: {
      type: 'string',
      description: 'A short tongue-in-cheek line a presenter would read on stage',
    },
    nominees: {
      type: 'array',
      description: 'Exactly 3 runner-up team/thread names, with a short reason each',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          team_name: { type: 'string' },
          citation: { type: 'string' },
        },
        required: ['team_name', 'citation'],
      },
    },
  },
  required: [
    'winner_team_name',
    'winner_citation',
    'quote',
    'quote_author',
    'presenter',
    'nominees',
  ],
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
  digest: string,
  pool: RawThread[],
): Promise<Category | null> {
  const system =
    'You are a witty but warm-hearted awards judge for "The Open Alliance Awards," a tongue-in-cheek Oscars parody for FRC (FIRST Robotics Competition) team build threads. ' +
    'These are real student teams — celebrate them. Be playful and funny about the ceremony, never mean about the people. ' +
    'You will be given candidate build threads. Pick exactly one winner and three runners-up for the given award. ' +
    'Use the exact team/thread names as written in the "###" headings. Pull a real, verbatim quote from the winning thread.'

  const userMsg =
    `Award: ${award.title} — ${award.emoji}\n` +
    `Pick the thread that best represents: ${award.criterion}.\n\n` +
    `Candidates:\n\n${digest}`

  // Force a tool call for reliable structured output across SDK versions.
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
    presenter: r.presenter,
    winner,
    quote: { text: r.quote, author: r.quote_author, url: winT.url },
    nominees,
  }
}

// ---- main ----

async function main() {
  const data: RawData = JSON.parse(await readFile(RAW, 'utf8'))
  const threads = data.threads.filter((t) => t.posts_count > 0)
  console.log(`Loaded ${threads.length} threads.`)

  const categories: Category[] = buildMetricAwards(threads)
  console.log(`Computed ${categories.length} metric awards.`)

  if (process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic()
    const { digest, pool } = buildDigest(threads)
    console.log(`Judging ${AI_AWARDS.length} AI awards over ${pool.length} candidates with ${MODEL}…`)
    for (const award of AI_AWARDS) {
      try {
        const cat = await judgeAiAward(client, award, digest, pool)
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
      '\nANTHROPIC_API_KEY not set — skipping AI-judged awards.\n' +
        'Set it (e.g. in .env or `export ANTHROPIC_API_KEY=...`) and re-run `npm run judge` for the full ceremony.\n',
    )
  }

  const show: AwardsShow = {
    season: SEASON,
    generatedAt: new Date().toISOString(),
    stats: {
      threads: threads.length,
      posts: threads.reduce((n, t) => n + t.posts.length, 0),
      totalLikes: threads.reduce((n, t) => n + t.like_count, 0),
      totalViews: threads.reduce((n, t) => n + t.views, 0),
    },
    categories,
  }

  await writeFile(OUT, JSON.stringify(show, null, 2))
  console.log(`\nWrote ${OUT} (${categories.length} categories).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
