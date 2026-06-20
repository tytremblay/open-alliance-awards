// Minimal, polite Discourse JSON client for Chief Delphi.
// - sends a browser User-Agent (the API 403s the default fetch UA via Cloudflare)
// - rate-limits requests
// - caches every response to disk so re-runs are free and don't hammer the forum

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CACHE_DIR = join(ROOT, '.cache')

export const BASE = 'https://www.chiefdelphi.com'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const DELAY_MS = 400
let lastRequest = 0

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function cachePath(url: string): string {
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 16)
  return join(CACHE_DIR, `${hash}.json`)
}

/** Fetch a Discourse JSON path (e.g. "/t/123.json"), with on-disk caching + retry. */
export async function getJSON<T = unknown>(path: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  const cp = cachePath(url)
  if (existsSync(cp)) {
    return JSON.parse(await readFile(cp, 'utf8')) as T
  }

  // rate limit
  const wait = DELAY_MS - (Date.now() - lastRequest)
  if (wait > 0) await sleep(wait)

  let lastErr: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    lastRequest = Date.now()
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      if (res.status === 429 || res.status >= 500) {
        await sleep(1000 * (attempt + 1) ** 2)
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      const text = await res.text()
      await mkdir(CACHE_DIR, { recursive: true })
      await writeFile(cp, text)
      return JSON.parse(text) as T
    } catch (err) {
      lastErr = err
      await sleep(1000 * (attempt + 1))
    }
  }
  throw new Error(`Failed after retries: ${url}\n${String(lastErr)}`)
}

// ---- Discourse response shapes (only the fields we use) ----

export interface DiscourseTag {
  id: number
  name: string
}

export interface TopicSummary {
  id: number
  title: string
  slug: string
  posts_count: number
  reply_count: number
  views: number
  like_count: number
  op_like_count?: number
  created_at: string
  last_posted_at: string
  tags?: string[] | DiscourseTag[]
}

export interface CategoryResponse {
  topic_list: {
    more_topics_url?: string
    topics: TopicSummary[]
  }
}

export interface Post {
  id: number
  username: string
  name?: string
  post_number: number
  created_at: string
  cooked: string
  reads?: number
  score?: number
  reply_count?: number
  like_count?: number
  /** Some Discourse builds expose like counts via actions_summary (id 2 == like). */
  actions_summary?: { id: number; count?: number }[]
}

export interface TopicResponse {
  id: number
  title: string
  slug: string
  posts_count: number
  views: number
  reply_count: number
  like_count: number
  created_at: string
  last_posted_at: string
  tags?: string[]
  post_stream: {
    posts: Post[]
    stream: number[]
  }
}

/** Likes on a post — normalizes the two shapes Discourse may return. */
export function postLikes(p: Post): number {
  if (typeof p.like_count === 'number') return p.like_count
  const like = p.actions_summary?.find((a) => a.id === 2)
  return like?.count ?? 0
}

export const topicUrl = (id: number, slug: string) => `${BASE}/t/${slug}/${id}`
export const postUrl = (id: number, slug: string, postNumber: number) =>
  `${BASE}/t/${slug}/${id}/${postNumber}`
