// Harvest the 2026 Open Alliance build threads from Chief Delphi into data/raw-2026.json.
//   npm run harvest
// Needs no API key. Polite + cached (see lib/discourse.ts) — safe to re-run.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getJSON,
  postLikes,
  topicUrl,
  type CategoryResponse,
  type Post,
  type TopicResponse,
  type TopicSummary,
} from './lib/discourse.ts'

const SEASON = 2026
const CATEGORY = '/c/first/open-alliance/89.json'
const MAX_PAGES = 20
const POST_BATCH = 20

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'data', `raw-${SEASON}.json`)

function tagNames(t: TopicSummary): string[] {
  const tags = t.tags ?? []
  return tags.map((x) => (typeof x === 'string' ? x : x.name))
}

/** A thread belongs to the 2026 season if tagged "2026" or created in/after Aug 2025. */
function isSeason(t: TopicSummary): boolean {
  return tagNames(t).includes(String(SEASON)) || t.created_at >= '2025-08-01'
}

/** Pull a team number out of a title like "FRC 6328 ..." or "Team 1540 ...". */
function parseTeam(title: string): number | null {
  // Prefer a number explicitly marked as a team (FRC/Team/# prefix).
  const tagged = title.match(/\b(?:frc|team)\s*#?(\d{1,5})\b|#(\d{1,5})\b/i)
  if (tagged) {
    const n = Number(tagged[1] ?? tagged[2])
    if (n >= 1 && n <= 99999) return n
  }
  // Otherwise take a bare number, but never a season year (e.g. "2026 FRC … Directory").
  for (const m of title.matchAll(/\b(\d{1,5})\b/g)) {
    const n = Number(m[1])
    if (n >= 1 && n <= 99999 && !(n >= 2018 && n <= 2030)) return n
  }
  return null
}

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

async function harvestThread(t: TopicSummary): Promise<{ posts: RawPost[]; slug: string }> {
  const top = await getJSON<TopicResponse>(`/t/${t.id}.json`)
  const slug = top.slug || t.slug
  const byNumber = new Map<number, Post>()
  for (const p of top.post_stream.posts) byNumber.set(p.id, p)

  // Fetch the posts not included in the first page.
  const have = new Set(byNumber.keys())
  const missing = top.post_stream.stream.filter((id) => !have.has(id))
  for (let i = 0; i < missing.length; i += POST_BATCH) {
    const chunk = missing.slice(i, i + POST_BATCH)
    const qs = chunk.map((id) => `post_ids[]=${id}`).join('&')
    const batch = await getJSON<{ post_stream: { posts: Post[] } }>(`/t/${t.id}/posts.json?${qs}`)
    for (const p of batch.post_stream.posts) byNumber.set(p.id, p)
  }

  const posts: RawPost[] = [...byNumber.values()]
    .sort((a, b) => a.post_number - b.post_number)
    .map((p) => ({
      id: p.id,
      post_number: p.post_number,
      username: p.username,
      name: p.name ?? p.username,
      created_at: p.created_at,
      score: p.score ?? 0,
      reads: p.reads ?? 0,
      likes: postLikes(p),
      cooked: p.cooked ?? '',
    }))

  return { posts, slug }
}

async function main() {
  console.log(`Harvesting ${SEASON} Open Alliance threads from Chief Delphi…`)

  // 1) Collect all season topics across category pages.
  const topics: TopicSummary[] = []
  const seen = new Set<number>()
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await getJSON<CategoryResponse>(`${CATEGORY}?page=${page}`)
    const list = data.topic_list.topics
    if (list.length === 0) break
    for (const t of list) {
      if (!seen.has(t.id) && isSeason(t)) {
        seen.add(t.id)
        topics.push(t)
      }
    }
    if (!data.topic_list.more_topics_url) break
  }
  console.log(`Found ${topics.length} season-${SEASON} threads. Fetching posts…`)

  // 2) Fetch every post for each thread.
  const threads = []
  let done = 0
  for (const t of topics) {
    const { posts, slug } = await harvestThread(t)
    threads.push({
      id: t.id,
      title: t.title,
      slug,
      url: topicUrl(t.id, slug),
      team: parseTeam(t.title),
      posts_count: t.posts_count,
      reply_count: t.reply_count,
      views: t.views,
      like_count: t.like_count,
      op_like_count: t.op_like_count ?? 0,
      created_at: t.created_at,
      last_posted_at: t.last_posted_at,
      tags: tagNames(t),
      posts,
    })
    done++
    if (done % 10 === 0 || done === topics.length) {
      console.log(`  ${done}/${topics.length} threads (${t.title.slice(0, 50)})`)
    }
  }

  const out = {
    season: SEASON,
    harvestedAt: new Date().toISOString(),
    threads,
  }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(out, null, 2))

  const totalPosts = threads.reduce((n, t) => n + t.posts.length, 0)
  console.log(`\nWrote ${OUT}`)
  console.log(`  ${threads.length} threads, ${totalPosts} posts harvested.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
