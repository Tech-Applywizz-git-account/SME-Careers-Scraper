import type { CsvJob, RawSmeJob } from "./types";

const SITE = "https://sme.careers";

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function toDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function workMode(value?: string): string {
  const v = clean(value).toLowerCase();
  if (v === "remote" || v === "onsite" || v === "hybrid") return v;
  if (v.includes("remote")) return "remote";
  if (v.includes("hybrid")) return "hybrid";
  if (v.includes("onsite") || v.includes("on-site")) return "onsite";
  return "remote";
}

function employmentType(value?: string): string {
  const v = clean(value).toLowerCase();
  if (v === "full_time" || v === "full-time") return "full_time";
  if (v === "part_time" || v === "part-time") return "part_time";
  if (v === "internship" || v === "intern") return "internship";
  if (v === "contract" || v === "contractor") return "contract";
  return v || "contract";
}

function salaryPeriod(payUnit?: string): string {
  const v = clean(payUnit).toLowerCase();
  if (v === "hourly" || v === "hour") return "hour";
  if (v === "monthly" || v === "month") return "month";
  if (v === "yearly" || v === "year" || v === "annual") return "year";
  return v ? "hour" : "";
}

/** Real pay only — empty when missing or placeholder 0/1 */
function salaryNum(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  if (value === 0 || value === 1) return "";
  return String(value);
}

function skillNames(job: RawSmeJob): string {
  const fromSkills = (job.skills ?? [])
    .map((s) => (typeof s === "string" ? s : s?.name))
    .map(clean)
    .filter(Boolean);
  const fromAi = (job.aiSuggestedSkills ?? []).map(clean).filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const name of [...fromSkills, ...fromAi]) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  return unique.slice(0, 40).join("; ");
}

function experienceYears(level?: string, requirements: string[] = []): {
  min: string;
  max: string;
} {
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

function buildDescription(job: RawSmeJob): string {
  const parts: string[] = [];
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

function locationText(job: RawSmeJob, country: string): string {
  const mode = workMode(job.workLocation);
  if (mode === "remote") return "Remote";
  const city = clean(job.city?.name);
  const state = clean(job.state?.name);
  return [city, state, country].filter(Boolean).join(", ") || "Remote";
}

function applyUrl(externalKey: string, title: string): string {
  const params = new URLSearchParams();
  params.set("externalKey", externalKey);
  params.set("jobTitle", title);
  return `${SITE}/jobs?${params.toString()}`;
}

export function countryName(job: RawSmeJob): string {
  return clean(job.country?.name);
}

export function countryCodeOf(job: RawSmeJob): string {
  return clean(job.countryCode || job.country?.countryCode).toUpperCase();
}

export function isIndiaJob(job: RawSmeJob): boolean {
  return countryName(job).toLowerCase() === "india" || countryCodeOf(job) === "IN";
}

function externalKeyOf(job: RawSmeJob): string {
  return clean(job.externalKey) || clean(job.jobPostingId);
}

/** Build eligible_countries map: externalKey → sorted country names */
export function eligibleCountriesByKey(raw: RawSmeJob[]): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const job of raw) {
    const key = externalKeyOf(job);
    const name = countryName(job);
    if (!key || !name) continue;
    const set = map.get(key) ?? new Set<string>();
    set.add(name);
    map.set(key, set);
  }
  const out = new Map<string, string[]>();
  for (const [k, set] of map) {
    out.set(k, [...set].sort((a, b) => a.localeCompare(b)));
  }
  return out;
}

/**
 * Dashboard / API row: one row per country posting.
 * Stable id: SME-<externalKey>-<COUNTRY_CODE>
 */
export function mapCountryJob(
  job: RawSmeJob,
  eligibleCountries: string[],
): CsvJob | null {
  const key = externalKeyOf(job);
  const title = clean(job.title);
  const description = buildDescription(job);
  const country = countryName(job) || "Unknown";
  const code = countryCodeOf(job) || "XX";
  if (!key || !title || !description) return null;

  const exp = experienceYears(job.experienceLevel, job.requirements ?? []);
  const rateMin = job.rateMin ?? job.hourlyRateMin;
  const rateMax = job.rateMax ?? job.hourlyRateMax;

  return {
    external_id: `SME-${key}-${code}`,
    title,
    description,
    apply_url: applyUrl(key, title),
    work_mode: workMode(job.workLocation),
    location: locationText(job, country),
    posted_date: toDate(job.createdAt) || toDate(job.updatedAt),
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
    eligible_countries: eligibleCountries.join("; "),
  };
}

/** Map full open catalog → country rows for dashboard/API */
export function mapAllCountryJobs(raw: RawSmeJob[]): CsvJob[] {
  const eligible = eligibleCountriesByKey(raw);
  const out: CsvJob[] = [];
  for (const job of raw) {
    const key = externalKeyOf(job);
    const row = mapCountryJob(job, eligible.get(key) ?? []);
    if (row) out.push(row);
  }
  return uniqueJobs(out);
}

/**
 * Partner feed: one India-eligible row per externalKey.
 * external_id = SME-<externalKey> (stable, no UUID)
 */
export function collapseToPartnerJobs(raw: RawSmeJob[]): CsvJob[] {
  const groups = new Map<string, RawSmeJob[]>();
  for (const job of raw) {
    const key = externalKeyOf(job);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(job);
    groups.set(key, list);
  }

  const out: CsvJob[] = [];
  for (const [key, rows] of groups) {
    const indiaRows = rows.filter(isIndiaJob);
    if (!indiaRows.length) continue;

    indiaRows.sort(
      (a, b) => clean(b.description).length - clean(a.description).length,
    );
    const india = indiaRows[0];
    const title = clean(india.title);
    const description = buildDescription(india);
    if (!title || !description) continue;

    const countries = [
      ...new Set(rows.map((r) => countryName(r)).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));

    const exp = experienceYears(india.experienceLevel, india.requirements ?? []);
    const rateMin = india.rateMin ?? india.hourlyRateMin;
    const rateMax = india.rateMax ?? india.hourlyRateMax;

    out.push({
      external_id: `SME-${key}`,
      title,
      description,
      apply_url: applyUrl(key, title),
      work_mode: workMode(india.workLocation),
      location: locationText(india, "India"),
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

  return uniqueJobs(out);
}

export function mapJob(job: RawSmeJob): CsvJob | null {
  return mapCountryJob(job, countryName(job) ? [countryName(job)] : []);
}

export function uniqueJobs(jobs: CsvJob[]): CsvJob[] {
  const map = new Map<string, CsvJob>();
  for (const job of jobs) {
    if (!job.external_id) continue;
    map.set(job.external_id, job);
  }
  return [...map.values()].sort((a, b) =>
    a.posted_date < b.posted_date ? 1 : a.posted_date > b.posted_date ? -1 : 0,
  );
}
