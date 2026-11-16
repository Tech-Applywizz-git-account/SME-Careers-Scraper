# SME Jobs Desk

Simple **Next.js + TypeScript** desk for [SME Careers](https://sme.careers/jobs) jobs.

**Developer handbook (Applywizz-style):** [/handbook](http://localhost:3000/handbook) — dark sidebar nav, sectioned guide. Source: [HANDBOOK.md](./HANDBOOK.md).

- Browser scrape (Playwright opens the website — no manual API client)
- Unique jobs by `jobPostingId` → stable `external_id` (`SME-<uuid>`)
- CSV in the exact upload schema
- Lightweight dashboard for Vercel (no heavy UI kit, no icon pack)

## Why this shape (Vercel)

| Piece | Where it runs | Why |
| --- | --- | --- |
| Dashboard + CSV download | Vercel (Next.js) | Small, fast, free-tier friendly |
| Daily scrape | Your PC or GitHub Action | Chromium is too heavy for Vercel serverless |

## Quick start

```bash
npm install
npm run scrape:install   # optional local Playwright scrape
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Use **From / To** (date + typeable hour/minute + AM/PM), **Quick range** (12/24/48/72 hrs), country / mode filters → **Scrape & download CSV**.

## Filter API

```
GET /api/scrape
  ?from=2026-11-15T04:30:00.000Z
  &to=2026-11-16T04:30:00.000Z
  &country=all|India
  &work_mode=all|remote|hybrid|onsite
  &employment_type=all|full_time|part_time|contract|internship
  &q=keyword
  &format=json|csv
```

Returns `{ meta, jobs }`. `meta.countries` lists available countries. Use `format=csv` to download.

## CSV download on Vercel?

**Yes.** After scrape, the browser builds the CSV and downloads it. You also get **Download current table** for whatever is on screen.

Notes:
- Vercel cannot save files into `public/` at runtime (read-only disk)
- Date filter keeps the response small enough for serverless
- Hobby plan has a short function timeout — use a tighter date range if scrape times out
- Pro plan: `maxDuration` is set to 60s for `/api/scrape`

## CSV columns

`external_id,title,description,apply_url,work_mode,location,posted_date,company_name,employment_type,country,salary_min,salary_max,salary_currency,salary_period,skills,experience_min_years,experience_max_years,closing_date,is_active`

## Deploy

1. Push to GitHub
2. Import in Vercel
3. Open the site → set dates → scrape → CSV downloads in the browser
