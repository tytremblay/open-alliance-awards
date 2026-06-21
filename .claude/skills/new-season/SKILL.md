---
name: new-season
description: Roll The Open Alliance Awards over to a new FRC season — bump the season constants, re-harvest Chief Delphi, re-judge, and commit the baked dataset. Use when the user wants to run the awards for a new year (e.g. "update for 2027", "run this year's ceremony", "new season").
---

# Rolling the awards to a new season

This repo bakes one FRC season of Chief Delphi Open Alliance build threads into a
static "awards ceremony" site. Each year the work is the same shape: point the
pipeline at the new season, re-run harvest + judge, and commit the new baked JSON.
The site only ever reads the committed `data/awards-<YEAR>.json`.

Read `README.md` first if you haven't — it explains the harvest → judge → site
data flow. This skill is the year-rollover checklist on top of that.

## Pick the season number

FRC seasons are named by the calendar year of competition (the 2027 season runs
roughly Aug 2026 → Jun 2027). Confirm the target year with the user if it's
ambiguous. Below, `$YEAR` is the new season (e.g. `2027`) and `$PREV` is the
season currently baked in (grep for it; it's `2026` as of this writing).

## Step 1 — bump the season constants

These are the only code edits. Change each, then verify nothing else still
references the old year in source.

| File | What to change |
|------|----------------|
| `scripts/harvest.ts` | `const SEASON = $PREV` → `$YEAR`. Also the cutoff in `isSeason()` — `t.created_at >= '$(PREV-1)-08-01'` → the August before `$YEAR` (e.g. for 2027, use `'2026-08-01'`). |
| `scripts/judge.ts` | `const SEASON = $PREV` → `$YEAR`. And `SEASON_END = '$PREV-06-01T00:00:00Z'` → `'$YEAR-06-01T00:00:00Z'` (a fixed "now" so reruns are deterministic; set it on/after the season's events conclude). |
| `src/data.ts` | `import raw from '../data/awards-$PREV.json'` → `awards-$YEAR.json`. |
| `index.html` | `<title>The Open Alliance Awards $PREV</title>` → `$YEAR`. |
| `.gitignore` | `data/raw-$PREV.json` → `data/raw-$YEAR.json` (the big raw harvest stays gitignored; only the baked awards JSON is committed). |

The output filenames (`raw-${SEASON}.json`, `awards-${SEASON}.json`) are derived
from `SEASON`, so they update automatically once the constants are bumped.

Sanity check after editing:

```bash
grep -rn "$PREV" scripts/ src/ index.html .gitignore   # should return nothing
```

`README.md` and `.github/workflows/deploy.yml` mention the year only in prose /
comments — update those for accuracy too, but they don't affect the build.

One slow-burn note: `parseTeam()` in `scripts/harvest.ts` excludes bare numbers in
the range `2018..2030` so a title like "2026 FRC Directory" isn't read as team
2026. Once seasons approach 2030, widen that upper bound.

## Step 2 — run the pipeline

```bash
npm install                          # if deps are stale
npm run harvest                      # Chief Delphi → data/raw-$YEAR.json (no key; cached, safe to re-run)
export ANTHROPIC_API_KEY=sk-ant-...  # or .env — without it, only metric/superlative awards run
npm run judge                        # raw → data/awards-$YEAR.json (committed)
npm run dev                          # preview the ceremony locally
```

`npm run ceremony` does harvest + judge in one go. Harvest is polite and cached
(`.cache/`), so re-running is cheap. Judge uses `claude-opus-4-8` over a
metric-prefiltered shortlist, so AI cost stays bounded regardless of corpus size.

If the early-season harvest finds few threads (the new season's build logs may not
be posted yet), that's expected — re-run later as more teams post.

## Step 3 — verify before committing

- `npm run build` succeeds (this is what CI runs).
- The dev/preview site renders with the new year in the title and real nominees.
- Spot-check `data/awards-$YEAR.json`: distinct team winners (a team wins at most
  one award), and the juried awards have content if you set an API key.
- **Tone:** keep win copy positive and standalone. Never frame a win as "because
  other teams were excluded" or as a consolation. The ceremony parodies the
  *ceremony*, never the people.

## Step 4 — commit & deploy

Commit the bumped source and the new **baked** JSON (not the raw harvest):

```bash
git add scripts/ src/ index.html .gitignore data/awards-$YEAR.json README.md
git commit -m "Open Alliance Awards $YEAR"
git push
```

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds from the
committed dataset and publishes to GitHub Pages. CI needs **no** API key — it never
re-harvests or re-judges. To refresh awards mid-season, re-run the pipeline locally
and commit the updated `data/awards-$YEAR.json`.

## Keeping previous seasons

Default is a clean rollover (the new year replaces the old in `src/data.ts` and the
title). If the user instead wants a multi-year archive, that's a larger change —
the site currently renders a single `show`. Confirm scope before building a year
selector; don't assume it.
