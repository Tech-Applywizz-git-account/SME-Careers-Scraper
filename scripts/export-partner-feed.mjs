/**
 * Export partner CSV: one India-eligible row per externalKey.
 * Output: docs/partner-feeds/sme/sme-jobs-YYYY-MM-DD.csv
 *
 * Usage: node scripts/export-partner-feed.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Use compiled logic via dynamic import of TS isn't available — duplicate thin fetch + call through next isn't needed.
// Inline the partner rules by spawning tsx isn't installed. Fetch + port the collapse in plain JS here
// matching src/lib/mapJob.ts collapseToPartnerJobs.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OPEN_JOBS_URL =
  "https://api.sme.careers/v1/jobs/open?include=applicants-count";

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
  "eligible_countries",
];

function clean(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
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

function salaryNum(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  if (value === 0 || value === 1) return "";
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
  if (workMode(job.workLocation) === "remote") return "Remote";
  return (
    [clean(job.city?.name), clean(job.state?.name), "India"]
      .filter(Boolean)
      .join(", ") || "Remote"
  );
}

function isIndia(job) {
  const name = clean(job.country?.name).toLowerCase();
  const code = clean(job.countryCode || job.country?.countryCode).toUpperCase();
  return name === "india" || code === "IN";
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

function collapse(raw) {
  const groups = new Map();
  for (const job of raw) {
    const key = clean(job.externalKey) || clean(job.jobPostingId);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(job);
    groups.set(key, list);
  }

  const out = [];
  for (const [key, rows] of groups) {
    const indiaRows = rows.filter(isIndia);
    if (!indiaRows.length) continue;
    indiaRows.sort(
      (a, b) => clean(b.description).length - clean(a.description).length,
    );
    const india = indiaRows[0];
    const title = clean(india.title);
    const description = buildDescription(india);
    if (!title || !description) continue;

    const countries = [
      ...new Set(
        rows
          .map((r) => clean(r.country?.name))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b)),
      ),
    ];

    const exp = experienceYears(india.experienceLevel, india.requirements ?? []);
    const rateMin = india.rateMin ?? india.hourlyRateMin;
    const rateMax = india.rateMax ?? india.hourlyRateMax;
    const params = new URLSearchParams({
      externalKey: key,
      jobTitle: title,
    });

    out.push({
      external_id: `SME-${key}`,
      title,
      description,
      apply_url: `https://sme.careers/jobs?${params.toString()}`,
      work_mode: workMode(india.workLocation),
      location: locationText(india),
      posted_date: toDate(india.createdAt) || toDate(india.updatedAt),
      company_name: "SME Careers by SuperAnnotate",
      employment_type: employmentType(india.employmentType),
      country: "India",
      salary_min: salaryNum(rateMin),
      salary_max: salaryNum(rateMax),
      salary_currency: clean(india.currencyCode) || "USD",
      salary_period: salaryPeriod(india.payUnit),
      skills: skillNames(india),
      experience_min_years: exp.min,
      experience_max_years: exp.max,
      closing_date: "",
      is_active: clean(india.status).toLowerCase() === "closed" ? "no" : "yes",
      eligible_countries: countries.join("; "),
    });
  }

  return out.sort((a, b) =>
    a.posted_date < b.posted_date ? 1 : a.posted_date > b.posted_date ? -1 : 0,
  );
}

async function main() {
  console.log("Fetching open jobs…");
  const res = await fetch(OPEN_JOBS_URL, {
    headers: {
      Accept: "application/json",
      Origin: "https://sme.careers",
      Referer: "https://sme.careers/jobs",
    },
  });
  if (!res.ok) throw new Error(`SME returned ${res.status}`);
  const payload = await res.json();
  const raw = payload?.data?.jobs ?? [];
  const jobs = collapse(raw);
  const day = new Date().toISOString().slice(0, 10);
  const dir = path.join(ROOT, "docs", "partner-feeds", "sme");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `sme-jobs-${day}.csv`);
  await writeFile(file, toCsv(jobs), "utf8");
  // Do NOT write public/data here — that snapshot must keep ALL countries
  // for the dashboard dropdown. Partner CSV stays under docs/partner-feeds only.

  console.log(`Wrote ${jobs.length} India-eligible jobs → ${file}`);
  const sample = jobs[0];
  if (sample) {
    console.log(
      "sample",
      sample.external_id,
      "min",
      JSON.stringify(sample.salary_min),
      "max",
      sample.salary_max,
      "countries",
      sample.eligible_countries.split("; ").length,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
