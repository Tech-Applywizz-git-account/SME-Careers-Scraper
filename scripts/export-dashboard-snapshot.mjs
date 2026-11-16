/**
 * Write public/data/jobs.json + jobs.csv with ALL country postings
 * so the dashboard country dropdown is fully populated on first load.
 *
 * Usage: node scripts/export-dashboard-snapshot.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function postedAtIso(job) {
  const iso = job.createdAt || job.updatedAt || "";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
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

function countryName(job) {
  return clean(job.country?.name);
}

function countryCode(job) {
  return clean(job.countryCode || job.country?.countryCode).toUpperCase();
}

function externalKey(job) {
  return clean(job.externalKey) || clean(job.jobPostingId);
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

function mapAll(raw) {
  const byKey = new Map();
  for (const job of raw) {
    const key = externalKey(job);
    const name = countryName(job);
    if (!key || !name) continue;
    const set = byKey.get(key) ?? new Set();
    set.add(name);
    byKey.set(key, set);
  }

  const out = [];
  const seen = new Set();
  for (const job of raw) {
    const key = externalKey(job);
    const title = clean(job.title);
    const description = buildDescription(job);
    const country = countryName(job) || "Unknown";
    const code = countryCode(job) || "XX";
    if (!key || !title || !description) continue;
    const id = `SME-${key}-${code}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const eligible = [...(byKey.get(key) ?? [])].sort((a, b) =>
      a.localeCompare(b),
    );
    const exp = experienceYears(job.experienceLevel, job.requirements ?? []);
    const rateMin = job.rateMin ?? job.hourlyRateMin;
    const rateMax = job.rateMax ?? job.hourlyRateMax;
    const mode = workMode(job.workLocation);
    const params = new URLSearchParams({
      externalKey: key,
      jobTitle: title,
    });

    out.push({
      external_id: id,
      title,
      description,
      apply_url: `https://sme.careers/jobs?${params.toString()}`,
      work_mode: mode,
      location:
        mode === "remote"
          ? "Remote"
          : [clean(job.city?.name), clean(job.state?.name), country]
              .filter(Boolean)
              .join(", ") || "Remote",
      posted_date: toDate(job.createdAt) || toDate(job.updatedAt),
      posted_at: postedAtIso(job),
      company_name: "SME Careers by SuperAnnotate",
      employment_type: employmentType(job.employmentType),
      country,
      salary_min: salaryNum(rateMin),
      salary_max: salaryNum(rateMax),
      salary_currency: clean(job.currencyCode) || "USD",
      salary_period: salaryPeriod(job.payUnit),
      skills: skillNames(job),
      experience_min_years: exp.min,
      experience_max_years: exp.max,
      closing_date: "",
      is_active: clean(job.status).toLowerCase() === "closed" ? "no" : "yes",
      eligible_countries: eligible.join("; "),
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
  const jobs = mapAll(raw);
  const countries = [
    ...new Set(jobs.map((j) => j.country).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  const pub = path.join(ROOT, "public", "data");
  await mkdir(pub, { recursive: true });
  const payloadOut = {
    meta: {
      scraped_at: new Date().toISOString(),
      source_url: "https://sme.careers/jobs",
      total: raw.length,
      unique: jobs.length,
      countries,
    },
    jobs,
  };
  await writeFile(path.join(pub, "jobs.json"), JSON.stringify(payloadOut), "utf8");
  await writeFile(path.join(pub, "jobs.csv"), toCsv(jobs), "utf8");
  console.log(
    `Dashboard snapshot: ${jobs.length} rows, ${countries.length} countries → public/data/`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
