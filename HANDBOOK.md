# SME Careers Scraper Developer Handbook

The complete guide for engineers working on the **SME-careers** job scrape desk (Next.js on Vercel). It explains how the scraper is shaped, how jobs are fetched and mapped to CSV, how the dashboard and APIs work, and how to ship — so a new developer can operate the project without tribal knowledge.

## 1. Overview

SME Careers Scraper is a staff/ops desk for pulling open roles from [sme.careers/jobs](https://sme.careers/jobs) and exporting them as an upload-ready CSV (`external_id`, title, description, apply URL, pay, skills, and more).

The repo is primarily:

```
sme-career-scraper/
├── src/app/              # Next.js App Router (dashboard + APIs + /handbook)
├── src/components/       # Dashboard UI
├── src/lib/              # scrape, map, csv, datetime helpers
├── scripts/scrape.mjs    # Optional Playwright full scrape
├── data/                 # Local scrape output
├── public/data/          # Static JSON/CSV served on Vercel
├── HANDBOOK.md           # This handbook (source)
└── vercel.json
```

> **Critical:** Prefer `jobPostingId` for uniqueness. SME’s `externalKey` repeats across countries. We always set `external_id = SME-<jobPostingId>` so re-uploads update jobs instead of duplicating them.

## 2. Where it runs

| Layer | Host | What deploys | Typical URL |
| --- | --- | --- | --- |
| Dashboard + APIs | **Vercel** (Next.js) | App Router pages, `/api/scrape` | Your Vercel domain |
| Static last scrape | Vercel CDN | `public/data/jobs.json` + `.csv` | `/data/jobs.csv` |
| Optional full scrape | Local PC or GitHub Action | Playwright + Chromium | Writes into `data/` + `public/data/` |
| This handbook | Same Next app | `/handbook` reads `HANDBOOK.md` | `/handbook` |

> **Note:** Chromium/Playwright is too heavy for typical Vercel Hobby serverless. Live scrapes on Vercel use the `/api/scrape` Node route (fetch + filter), not a browser.

## 3. Quick start

```
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Optional full offline scrape:

```
npm run scrape:install
npm run scrape
```

Production build:

```
npm run build
npm start
```

## 4. Mental model

```
Operator browser (Vercel)
   │
   ├─ Dashboard UI  ──filters──►  GET /api/scrape
   │                                  │
   │                                  ▼
   │                            scrapeJobs()
   │                                  │
   │                     fetch SME open-jobs feed
   │                                  │
   │                     mapJob() → CSV rows
   │                                  │
   │                     filter: from/to, country,
   │                             work_mode, employment_type, q
   │                                  │
   └─ downloadCsv() in browser  ◄──── JSON { meta, jobs }

Optional: Playwright script opens sme.careers/jobs,
collects the full catalog, writes public/data/*
```

1. **UI is thin.** Mapping and filter rules live in `src/lib/`.
2. **`/api/scrape`** = live filtered scrape for dashboard and integrators.
3. **`public/data/*`** = last committed/Playwright snapshot (static).
4. **CSV schema** is the contract for your external upload pipeline.

## 5. Project map (`src/`)

| Area | Path | Purpose |
| --- | --- | --- |
| Dashboard | `src/app/page.tsx`, `src/components/Dashboard.tsx` | Filters, scrape button, table, CSV download |
| Handbook | `src/app/handbook/page.tsx` | This guide at `/handbook` |
| Scrape API | `src/app/api/scrape/route.ts` | `GET` with filters → JSON or CSV |
| Static redirects | `src/app/api/jobs`, `src/app/api/csv` | Redirect to `/data/jobs.*` |
| Types / CSV headers | `src/lib/types.ts` | Column contract |
| Mapper | `src/lib/mapJob.ts` | SME raw → CSV row |
| Scrape core | `src/lib/scrapeJobs.ts` | Fetch + filter |
| Datetime | `src/lib/datetime.ts` | Quick ranges, local ↔ ISO |
| CSV helpers | `src/lib/csv.ts`, `downloadCsv.ts` | Serialize + browser download |
| Playwright | `scripts/scrape.mjs` | Full local/CI scrape |

## 6. How the scraper works

### Path A — Dashboard / API (Vercel-safe)

1. Client calls `/api/scrape?...`.
2. Server fetches SME open jobs feed.
3. Rows are filtered by datetime (`createdAt` / `updatedAt`), then mapped, then filtered by country / mode / type / `q`.
4. Response is JSON; the browser builds and downloads CSV.

### Path B — Playwright (local / GitHub Action)

1. Chromium opens `https://sme.careers/jobs`.
2. Scrolls paginated UI and loads the full open catalog in-session.
3. Dedupes by `jobPostingId`.
4. Writes `data/jobs.*` and `public/data/jobs.*`.

> **Critical:** The public UI lists ~272 grouped roles. Country-level uniqueness needs the full open catalog (often 2000+ rows). Path A and Path B both target that full set.

## 7. Dashboard features

Toolbar (compact):

| Control | Behavior |
| --- | --- |
| From / To | `datetime-local` → ISO for API |
| Quick range | Last 1h, 6h, 12h, 24h, 7 days, Custom |
| Country | `all` or specific |
| More filters | Work mode, employment type |
| Scrape & download CSV | Live scrape + browser CSV |
| ↓ CSV | Download current table only |

Also: search box, stats strip, job table (500 visible rows max; full set in CSV).

> **Note:** On Vercel, scrape does **not** rewrite `public/data/`. Disk is read-only. Use the download from the scrape response.

## 8. API reference

### `GET /api/scrape`

| Param | Default | Values |
| --- | --- | --- |
| `from` | _(none)_ | ISO datetime |
| `to` | _(none)_ | ISO datetime |
| `country` | `all` | `all` or country name |
| `work_mode` | `all` | `all` \| `remote` \| `hybrid` \| `onsite` |
| `employment_type` | `all` | `all` \| `full_time` \| `part_time` \| `contract` \| `internship` |
| `q` | `""` | search text |
| `format` | `json` | `json` \| `csv` |

### Example: 15-Nov-2026 → 16-Nov-2026 (IST)

```
http://localhost:3000/api/scrape?from=2026-11-15T00:00:00.000%2B05:30&to=2026-11-16T23:59:59.999%2B05:30&country=all&format=json
```

CSV:

```
http://localhost:3000/api/scrape?from=2026-11-15T00:00:00.000%2B05:30&to=2026-11-16T23:59:59.999%2B05:30&country=all&format=csv
```

India only:

```
http://localhost:3000/api/scrape?from=2026-11-15T00:00:00.000%2B05:30&to=2026-11-16T23:59:59.999%2B05:30&country=India&format=json
```

### JSON shape

```
{
  "meta": {
    "scraped_at": "...",
    "source_url": "https://sme.careers/jobs",
    "total": 2251,
    "unique": 42,
    "filters": { "from": "", "to": "", "country": "all", "work_mode": "all", "employment_type": "all", "q": "" },
    "countries": ["India", "Japan", "..."]
  },
  "jobs": [ { "external_id": "SME-...", "title": "...", "...": "..." } ]
}
```

### Other endpoints

| URL | Behavior |
| --- | --- |
| `/api/jobs` | Redirect → `/data/jobs.json` |
| `/api/csv` | Redirect → `/data/jobs.csv` |
| `/data/jobs.json` | Static last scrape |
| `/data/jobs.csv` | Static last scrape |

## 9. CSV schema & mapping

Required: `external_id`, `title`, `description`, `apply_url`, `work_mode`, `location`, `posted_date`.

Recommended: `company_name`, `employment_type`, `country`, `salary_*`, `skills`, `experience_*`, `closing_date`, `is_active`.

| CSV column | SME source |
| --- | --- |
| `external_id` | `SME-` + `jobPostingId` |
| `title` | `title` |
| `description` | description + requirements + responsibilities |
| `apply_url` | `https://sme.careers/jobs?externalKey&jobTitle` (or jobPostingId) |
| `work_mode` | `workLocation` |
| `location` | Remote or city/state/country |
| `posted_date` | `createdAt` → `YYYY-MM-DD` |
| `company_name` | `SME Careers by SuperAnnotate` |
| `employment_type` | `employmentType` |
| `country` | `country.name` |
| `salary_min/max` | `rateMin` / `rateMax` |
| `salary_currency` | `currencyCode` |
| `salary_period` | `payUnit` → hour/month/year |
| `skills` | skills + aiSuggestedSkills (`; ` joined) |
| `is_active` | `yes` unless closed |

File rules: UTF-8, header exact, quote commas/newlines, max ~5000 rows.

## 10. Modules deep-dive

- **`scrapeJobs.ts`** — fetch feed, datetime gate, map, secondary filters, cap 5000.
- **`mapJob.ts`** — one raw SME job → one CSV row; `uniqueJobs()` by `external_id`.
- **`datetime.ts`** — quick ranges; `datetime-local` ↔ clock ↔ `clockToIso()`.
- **`csv.ts` / `downloadCsv.ts`** — server string + browser Blob download.
- **`Dashboard.tsx`** — state for filters; calls scrape; table + search.

## 11. Playwright & CI

```
npm run scrape:install
npm run scrape
```

GitHub Action: `.github/workflows/daily-scrape.yml` (schedule + `workflow_dispatch`). Commits updated `public/data/*` when configured with push permissions.

## 12. Ship on Vercel

1. Push to GitHub.
2. Import Next.js project in Vercel.
3. Deploy.
4. Open `/` to scrape; open `/handbook` for this guide.

`vercel.json` sets `/api/scrape` `maxDuration` to 60s (Pro). On Hobby, keep date ranges tight to avoid timeouts.

## 13. Troubleshooting

| Problem | Fix |
| --- | --- |
| Missing `./611.js` / broken `.next` | Delete `.next`, rerun `npm run dev` |
| 0 jobs from scrape | Widen `from`/`to`; check timezone (`+05:30` vs `Z`) |
| Vercel timeout | Narrow range; filter country |
| Stale `/data/jobs.csv` | Run Playwright scrape + redeploy, or use live scrape button |
| Duplicate jobs on upload | Confirm `external_id` uses `jobPostingId`, not `externalKey` |

## 14. This handbook hosting

- **Source file:** `HANDBOOK.md` at repo root.
- **Route:** `/handbook` (Next.js server page reads the markdown and renders it).
- **Nav:** left sidebar sections mirror this document.
- **Dashboard link:** “Handbook” on the main scrape desk.

> **OK:** Edit `HANDBOOK.md` and redeploy (or refresh in dev) — `/handbook` updates from that file. Keep anchors and section numbers in sync with the sidebar in `src/app/handbook/page.tsx`.

## 15. Onboarding checklist

1. Run `npm install` + `npm run dev`.
2. Open `/` and scrape Last 24 hrs.
3. Hit the example `/api/scrape` URL for 15–16 Nov with `format=json`.
4. Download CSV; confirm headers match §9.
5. Read §4 mental model and §6 scrape paths.
6. Skim §12 before first Vercel deploy.

## 16. Glossary

| Term | Meaning |
| --- | --- |
| SME Careers | SuperAnnotate expert marketplace at sme.careers |
| jobPostingId | Unique UUID per country posting |
| externalKey | Shared role key (not unique) |
| Path A | `/api/scrape` live filtered scrape |
| Path B | Playwright full scrape to disk |
| external_id | Stable upload key `SME-<jobPostingId>` |
