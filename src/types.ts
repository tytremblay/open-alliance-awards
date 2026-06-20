// Shared data contract between the build-time pipeline (scripts/) and the site (src/).

/** A team/thread nominee or winner in a category. */
export interface Nominee {
  /** Team number if we could parse one from the title, else null. */
  team: number | null
  /** Display name of the team / thread author line. */
  teamName: string
  /** Thread title as it appears on Chief Delphi. */
  threadTitle: string
  /** Canonical link back to the Chief Delphi thread. */
  url: string
  /** Short reason this entry was nominated / won (one sentence). */
  citation: string
  /** Headline stat shown on the card, e.g. "492 likes" or "17,408 views". */
  stat?: string
}

/** A pulled quote from a thread, shown on the winner card. */
export interface PullQuote {
  text: string
  author: string
  /** Deep link to the specific post, when known. */
  url: string
}

export type JudgingMethod = 'metric' | 'ai'

export interface Category {
  key: string
  title: string
  emoji: string
  /** One-line description of what the award honors. */
  blurb: string
  method: JudgingMethod
  winner: Nominee
  nominees: Nominee[]
  quote?: PullQuote
  /** Presenter patter — a short tongue-in-cheek line read "on stage". */
  presenter?: string
}

export interface AwardsShow {
  season: number
  generatedAt: string
  /** Headline corpus stats for the ceremony intro. */
  stats: {
    threads: number
    posts: number
    totalLikes: number
    totalViews: number
  }
  categories: Category[]
}
