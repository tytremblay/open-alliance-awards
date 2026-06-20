# 🏆 The Open Alliance Awards

A tongue-in-cheek, Oscars-style awards ceremony for [Chief Delphi Open Alliance](https://www.chiefdelphi.com/c/first/open-alliance/89)
FRC build threads. Harvests a season of public team build logs, hands out awards
(some by the numbers, some judged by Claude), and renders the whole thing as a
black-tie static site you can host **free on GitHub Pages**.

Made with admiration for every team that builds in the open. It parodies the
*ceremony*, never the people.

## How it works

```
Chief Delphi (Discourse JSON API)
        │  scripts/harvest.ts   → data/raw-2026.json   (gitignored, ~26 MB)
        ▼
   raw thread + post data
        │  scripts/judge.ts     → data/awards-2026.json (committed, tiny)
        ▼
   baked ceremony data ──────►  Vite + React site (src/)  ──►  GitHub Pages
```

The site **only reads the committed `data/awards-2026.json`** — no scraping or
API calls happen at build or runtime, and no secrets ship to the browser.

## Awards

**Metric-based** (computed from engagement numbers, no API key):
Best Picture (likes) · Audience Award (views) · Most Talkative Ensemble (posts) ·
Box Office Smash (likes/day) · People's Choice (top single post).

**AI-judged** (Claude reads the threads):
Best Original Screenplay · Best Engineering Deep-Dive · Best Cinematography ·
Best Comedic Moment · Best Comeback · Lifetime-of-the-Season Achievement.

## Run it

```bash
npm install

# 1. Harvest the season (polite + cached; safe to re-run)
npm run harvest

# 2. Judge. Metric awards always run; AI awards run only if a key is set.
export ANTHROPIC_API_KEY=sk-ant-...   # or put it in .env
npm run judge

# 3. Preview the ceremony
npm run dev
```

`npm run ceremony` runs harvest + judge in sequence.

`judge.ts` uses `claude-opus-4-8` over a metric-prefiltered shortlist of the top
threads, so AI cost stays bounded regardless of corpus size.

## Build & deploy

```bash
npm run build            # static output in dist/
npm run preview          # serve the production build locally
```

Deployment is automatic via `.github/workflows/deploy.yml` on push to `main`:
GitHub Actions builds from the committed dataset and publishes to GitHub Pages.
The build sets Vite's `base` to `/<repo-name>/` so project-page asset paths
resolve. Enable it once under **Settings → Pages → Source: GitHub Actions**.

CI needs **no** `ANTHROPIC_API_KEY` — it builds from `data/awards-2026.json`.
To refresh awards, run the pipeline locally and commit the new JSON.

## Stack

Vite · React · TypeScript · Tailwind CSS v4 · `@anthropic-ai/sdk` · `tsx`.

Not affiliated with FIRST, Chief Delphi, or the Academy of anything.
