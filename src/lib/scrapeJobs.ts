import { countryName, mapAllCountryJobs } from "./mapJob";
import type { CsvJob, JobsPayload, RawSmeJob, ScrapeFilters } from "./types";

const OPEN_JOBS_URL =
  "https://api.sme.careers/v1/jobs/open?include=applicants-count";

export type ScrapeOptions = {
  from?: string;
  to?: string;
  country?: string;
  work_mode?: string;
  employment_type?: string;
  q?: string;
};

function parseBound(value: string, label: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) {
    throw new Error(`${label} must be a valid date/time`);
  }
  return ms;
}

function jobTimeMs(job: RawSmeJob): number {
  const iso = job.createdAt || job.updatedAt || "";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? NaN : ms;
}

export async function scrapeJobs(opts: ScrapeOptions = {}): Promise<JobsPayload> {
  const from = (opts.from ?? "").trim();
  const to = (opts.to ?? "").trim();
  const country = (opts.country ?? "all").trim() || "all";
  const workMode = (opts.work_mode ?? "all").trim() || "all";
  const employmentType = (opts.employment_type ?? "all").trim() || "all";
  const q = (opts.q ?? "").trim();

  const fromMs = parseBound(from, "from");
  const toMs = parseBound(to, "to");
  if (fromMs !== null && toMs !== null && fromMs > toMs) {
    throw new Error("from cannot be after to");
  }

  const res = await fetch(OPEN_JOBS_URL, {
    headers: {
      Accept: "application/json",
      Origin: "https://sme.careers",
      Referer: "https://sme.careers/jobs",
      "User-Agent":
        "Mozilla/5.0 (compatible; SMEJobsDesk/1.0; +https://sme.careers)",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`SME site returned ${res.status}`);
  }

  const payload = (await res.json()) as { data?: { jobs?: RawSmeJob[] } };
  const raw = payload.data?.jobs ?? [];

  // Full country list for the dropdown (always all countries from feed)
  const allCountries = [
    ...new Set(raw.map((j) => countryName(j)).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  // Date filter on each posting's createdAt
  const inDate = raw.filter((job) => {
    if (fromMs === null && toMs === null) return true;
    const t = jobTimeMs(job);
    if (Number.isNaN(t)) return false;
    if (fromMs !== null && t < fromMs) return false;
    if (toMs !== null && t > toMs) return false;
    return true;
  });

  let jobs: CsvJob[] = mapAllCountryJobs(inDate);

  const needle = q.toLowerCase();
  jobs = jobs
    .filter((job) => {
      if (country !== "all" && job.country.toLowerCase() !== country.toLowerCase()) {
        return false;
      }
      if (workMode !== "all" && job.work_mode !== workMode) return false;
      if (employmentType !== "all" && job.employment_type !== employmentType) {
        return false;
      }
      if (!needle) return true;
      return [
        job.title,
        job.location,
        job.country,
        job.eligible_countries,
        job.skills,
        job.employment_type,
        job.external_id,
        job.description,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    })
    .slice(0, 5000);

  const filters: ScrapeFilters = {
    from,
    to,
    country,
    work_mode: workMode,
    employment_type: employmentType,
    q,
  };

  return {
    meta: {
      scraped_at: new Date().toISOString(),
      source_url: "https://sme.careers/jobs",
      total: raw.length,
      unique: jobs.length,
      filters,
      countries: allCountries,
    },
    jobs,
  };
}
