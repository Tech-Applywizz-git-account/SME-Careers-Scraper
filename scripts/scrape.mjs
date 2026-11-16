/**
 * Opens sme.careers/jobs in Chromium, lets the page load jobs,
 * scrolls through every page, and writes CSV + JSON.
 *
 * Usage: npm run scrape
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const SOURCE = "https://sme.careers/jobs";

const CSV_HEADERS = [
  "external_id",
  "title",
  "description",
  "apply_url",
  "work_mode",
  "location",
  "posted_date",
  "company_name",
  "employment_type",
  "country",
  "salary_min",
  "salary_max",
  "salary_currency",
  "salary_period",
  "skills",
  "experience_min_years",
  "experience_max_years",
  "closing_date",
  "is_active",
];

function clean(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .trim();
}

function toDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function workMode(value) {
  const v = clean(value).toLowerCase();
  if (v === "remote" || v === "onsite" || v === "hybrid") return v;
  if (v.includes("remote")) return "remote";
  if (v.includes("hybrid")) return "hybrid";
  if (v.includes("onsite") || v.includes("on-site")) return "onsite";
  return "remote";
}

function employmentType(value) {
  const v = clean(value).toLowerCase();
  if (v === "full_time" || v === "full-time") return "full_time";
  if (v === "part_time" || v === "part-time") return "part_time";
  if (v === "internship" || v === "intern") return "internship";
  if (v === "contract" || v === "contractor") return "contract";
  return v || "contract";
}

function salaryPeriod(payUnit) {
  const v = clean(payUnit).toLowerCase();
  if (v === "hourly" || v === "hour") return "hour";
  if (v === "monthly" || v === "month") return "month";
  if (v === "yearly" || v === "year" || v === "annual") return "year";
  return v ? "hour" : "";
}

function num(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return String(value);
}

function skillNames(job) {
  const fromSkills = (job.skills ?? [])
    .map((s) => (typeof s === "string" ? s : s?.name))
    .map(clean)
    .filter(Boolean);
  const fromAi = (job.aiSuggestedSkills ?? []).map(clean).filter(Boolean);
  const seen = new Set();
  const unique = [];
  for (const name of [...fromSkills, ...fromAi]) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  return unique.slice(0, 40).join("; ");
}

function experienceYears(level, requirements = []) {
  const text = requirements.join(" ");
  const range = text.match(/(\d+)\s*(?:\+|–|-|to)\s*(\d+)\s*\+?\s*years?/i);
  if (range) return { min: range[1], max: range[2] };
  const plus = text.match(/(\d+)\s*\+\s*years?/i);
  if (plus) return { min: plus[1], max: "" };
  const v = clean(level).toLowerCase();
  if (v === "internship" || v === "entry_level" || v === "associate") {
    return { min: "0", max: "2" };
  }
  if (v === "mid_senior_level") return { min: "3", max: "8" };
  if (v === "director" || v === "executive") return { min: "8", max: "" };
  return { min: "", max: "" };
}

function buildDescription(job) {
  const parts = [];
  const desc = clean(job.description);
  if (desc) parts.push(desc);
  const reqs = (job.requirements ?? []).map(clean).filter(Boolean);
  if (reqs.length) {
    parts.push("Requirements:");
    parts.push(reqs.map((r) => `- ${r}`).join("\n"));
  }
  const resp = (job.responsibilities ?? []).map(clean).filter(Boolean);
  if (resp.length) {
    parts.push("Responsibilities:");
    parts.push(resp.map((r) => `- ${r}`).join("\n"));
  }
  return parts.join("\n\n");
}

function locationText(job) {
  const mode = workMode(job.workLocation);
  if (mode === "remote") return "Remote";
  return (
    [clean(job.city?.name), clean(job.state?.name), clean(job.country?.name)]
      .filter(Boolean)
      .join(", ") || "Remote"
  );
}

function applyUrl(job) {
  const params = new URLSearchParams();
  const key = clean(job.externalKey);
  const title = clean(job.title);
  if (key && title) {
    params.set("externalKey", key);
    params.set("jobTitle", title);
  } else if (job.jobPostingId) {
    params.set("jobPostingId", job.jobPostingId);
  }
  return `https://sme.careers/jobs?${params.toString()}`;
}

function mapJob(job) {
  const id = clean(job.jobPostingId);
  const title = clean(job.title);
  const description = buildDescription(job);
  if (!id || !title || !description) return null;
  const exp = experienceYears(job.experienceLevel, job.requirements ?? []);
  return {
    external_id: `SME-${id}`,
    title,
    description,
    apply_url: applyUrl(job),
    work_mode: workMode(job.workLocation),
    location: locationText(job),
    posted_date: toDate(job.createdAt) || toDate(job.updatedAt),
    company_name: "SME Careers by SuperAnnotate",
    employment_type: employmentType(job.employmentType),
    country:
      clean(job.country?.name) ||
      clean(job.countries?.[0]?.name) ||
      clean(job.countryPayrates?.[0]?.name) ||
      "India",
    salary_min: num(job.rateMin ?? job.hourlyRateMin),
    salary_max: num(job.rateMax ?? job.hourlyRateMax),
    salary_currency: clean(job.currencyCode) || "USD",
    salary_period: salaryPeriod(job.payUnit),
    skills: skillNames(job),
    experience_min_years: exp.min,
    experience_max_years: exp.max,
    closing_date: "",
    is_active: clean(job.status).toLowerCase() === "closed" ? "no" : "yes",
  };
}

function uniqueJobs(jobs) {
  const map = new Map();
  for (const job of jobs) {
    if (!job?.external_id) continue;
    map.set(job.external_id, job);
  }
  return [...map.values()].sort((a, b) =>
    a.posted_date < b.posted_date ? 1 : a.posted_date > b.posted_date ? -1 : 0,
  );
}

function escapeCell(value) {
  const text = value ?? "";
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(jobs) {
  const lines = [CSV_HEADERS.join(",")];
  for (const job of jobs) {
    lines.push(CSV_HEADERS.map((h) => escapeCell(job[h] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}

function pickJobs(payload) {
  if (!payload) return [];
  if (Array.isArray(payload?.data?.jobs)) return payload.data.jobs;
  if (Array.isArray(payload?.jobs)) return payload.jobs;
  if (Array.isArray(payload?.data) && payload.data[0]?.title) return payload.data;
  if (Array.isArray(payload) && payload[0]?.title) return payload;
  return [];
}

function pickPageMeta(payload) {
  const page = payload?.page || payload?.data?.page || null;
  if (!page) return null;
  return {
    number: Number(page.number ?? page.page ?? 0),
    totalPages: Number(page.totalPages ?? 0),
    totalElements: Number(page.totalElements ?? 0),
  };
}

async function scrapeFromBrowser() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const byId = new Map();
  let lastMeta = null;

  // Soften the site's default "recommended + 25" listing while still
  // using the same request the webpage itself fires.
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const isJobsList =
      url.hostname.includes("sme.careers") &&
      url.pathname.includes("/jobs") &&
      (url.pathname.includes("paginated") || url.pathname.endsWith("/open"));

    if (isJobsList && url.pathname.includes("paginated")) {
      url.searchParams.delete("recommended");
      url.searchParams.set("size", "100");
      if (!url.searchParams.get("include")) {
        url.searchParams.set("include", "applicants-count");
      }
      return route.continue({ url: url.toString() });
    }
    return route.continue();
  });

  page.on("response", async (response) => {
    try {
      const url = response.url();
      if (!url.includes("sme.careers")) return;
      if (!url.includes("job")) return;
      const type = response.headers()["content-type"] || "";
      if (!type.includes("json")) return;
      if (response.status() !== 200) return;
      const json = await response.json();
      const jobs = pickJobs(json);
      for (const job of jobs) {
        const id = job.jobPostingId || job.externalKey;
        if (id) byId.set(id, job);
      }
      const meta = pickPageMeta(json);
      if (meta) lastMeta = meta;
    } catch {
      // ignore
    }
  });

  console.log(`Opening ${SOURCE} ...`);
  await page.goto(SOURCE, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(2500);

  // Scroll the public list so the page itself loads every page of results.
  let stableRounds = 0;
  let previous = 0;
  for (let i = 0; i < 80; i++) {
    const count = byId.size;
    if (count > 0 && count === previous) stableRounds += 1;
    else stableRounds = 0;
    previous = count;

    if (lastMeta?.totalPages && lastMeta.number >= lastMeta.totalPages) break;
    if (stableRounds >= 4) break;

    await page.evaluate(() => {
      const sentinel =
        document.querySelector('[data-testid="public-jobs-load-more-sentinel"]') ||
        document.querySelector('[data-testid*="load-more"]') ||
        document.querySelector("footer");
      (sentinel || document.body).scrollIntoView({ block: "end" });
      window.scrollBy(0, window.innerHeight);
    });
    await page.waitForTimeout(1000);
    console.log(
      `  scroll ${i + 1}: ${byId.size} jobs` +
        (lastMeta?.totalElements ? ` / ~${lastMeta.totalElements}` : ""),
    );
  }

  // The public UI groups roles (~272). The same website also loads the full
  // open catalog (country-level rows) for job details — pull that from the
  // browser session after the page has already been opened.
  console.log("Loading full open catalog from the site session ...");
  const full = await page.evaluate(async () => {
    const res = await fetch(
      "https://api.sme.careers/v1/jobs/open?include=applicants-count",
      {
        headers: { Accept: "application/json", Referer: "https://sme.careers/jobs" },
        credentials: "include",
      },
    );
    if (!res.ok) return null;
    return res.json();
  });

  const fullJobs = pickJobs(full);
  if (fullJobs.length > byId.size) {
    for (const job of fullJobs) {
      const id = job.jobPostingId || job.externalKey;
      if (id) byId.set(id, job);
    }
    console.log(`  catalog: ${fullJobs.length} rows`);
  }

  await browser.close();
  return [...byId.values()];
}

async function main() {
  const started = Date.now();
  const raw = await scrapeFromBrowser();
  if (!raw.length) {
    throw new Error(
      "No jobs collected from the website. The page layout may have changed.",
    );
  }

  const mapped = uniqueJobs(raw.map(mapJob).filter(Boolean)).slice(0, 5000);
  const payload = {
    meta: {
      scraped_at: new Date().toISOString(),
      source_url: SOURCE,
      total: raw.length,
      unique: mapped.length,
    },
    jobs: mapped,
  };

  await mkdir(DATA, { recursive: true });
  const jsonPath = path.join(DATA, "jobs.json");
  const csvPath = path.join(DATA, "jobs.csv");
  await writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  await writeFile(csvPath, toCsv(mapped), "utf8");

  const pub = path.join(ROOT, "public", "data");
  await mkdir(pub, { recursive: true });
  await writeFile(path.join(pub, "jobs.json"), JSON.stringify(payload), "utf8");
  await writeFile(path.join(pub, "jobs.csv"), toCsv(mapped), "utf8");

  console.log(
    `Done in ${((Date.now() - started) / 1000).toFixed(1)}s — ${mapped.length} unique jobs`,
  );
  console.log(`CSV:  ${csvPath}`);
  console.log(`JSON: ${jsonPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
