"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../app/page.module.css";
import {
  QUICK_RANGES,
  clockToDatetimeLocal,
  clockToIso,
  datetimeLocalToClock,
  formatClockRange,
  jobInIsoRange,
  lastNHoursWindow,
  type ClockValue,
  type QuickRangeHours,
} from "@/lib/datetime";
import { downloadCsv } from "@/lib/downloadCsv";
import type { CsvJob, ScrapeMeta } from "@/lib/types";

function money(job: CsvJob): string {
  if (!job.salary_min && !job.salary_max) return "—";
  const cur = job.salary_currency || "";
  const period = job.salary_period ? `/${job.salary_period}` : "";
  if (job.salary_min && job.salary_max) {
    return `${cur} ${job.salary_min}–${job.salary_max}${period}`;
  }
  return `${cur} ${job.salary_min || job.salary_max}${period}`;
}

function applyLocalFilters(
  list: CsvJob[],
  opts: {
    country: string;
    mode: string;
    employmentType: string;
    q: string;
    fromIso: string | null;
    toIso: string | null;
  },
): CsvJob[] {
  const needle = opts.q.trim().toLowerCase();
  return list.filter((job) => {
    if (!jobInIsoRange(job, opts.fromIso, opts.toIso)) return false;
    if (opts.mode !== "all" && job.work_mode !== opts.mode) return false;
    if (
      opts.country !== "all" &&
      job.country.toLowerCase() !== opts.country.toLowerCase()
    ) {
      return false;
    }
    if (
      opts.employmentType !== "all" &&
      job.employment_type !== opts.employmentType
    ) {
      return false;
    }
    if (!needle) return true;
    return [
      job.title,
      job.description,
      job.location,
      job.country,
      job.eligible_countries,
      job.skills,
      job.employment_type,
      job.work_mode,
      job.external_id,
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

function safeClockToIso(clock: ClockValue): string | null {
  try {
    return clockToIso(clock);
  } catch {
    return null;
  }
}

export default function Dashboard() {
  // Default: All time — full catalog until user narrows the window
  const [meta, setMeta] = useState<ScrapeMeta | null>(null);
  const [jobs, setJobs] = useState<CsvJob[]>([]);
  const [allCountries, setAllCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("all");
  const [country, setCountry] = useState("all");
  const [employmentType, setEmploymentType] = useState("all");
  const [quickRange, setQuickRange] = useState<string>("0");
  const [moreOpen, setMoreOpen] = useState(false);
  const [fromClock, setFromClock] = useState<ClockValue>(() => {
    const w = lastNHoursWindow(24 * 365);
    return w.from;
  });
  const [toClock, setToClock] = useState<ClockValue>(() => {
    const w = lastNHoursWindow(24 * 365);
    return w.to;
  });
  const allTime = quickRange === "0";

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/data/jobs.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`Could not load jobs (${res.status})`);
        const data = await res.json();
        if (!alive) return;
        setMeta(data.meta ?? null);
        const loadedJobs: CsvJob[] = Array.isArray(data.jobs)
          ? (data.jobs as CsvJob[])
          : [];
        setJobs(loadedJobs);
        const fromMeta = data.meta?.countries;
        if (
          Array.isArray(fromMeta) &&
          fromMeta.length &&
          fromMeta.every((c: unknown) => typeof c === "string")
        ) {
          setAllCountries(fromMeta as string[]);
        } else {
          const countries = [
            ...new Set(
              loadedJobs
                .map((j) => j.country)
                .filter((c): c is string => Boolean(c)),
            ),
          ].sort((a, b) => a.localeCompare(b));
          setAllCountries(countries);
        }
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load jobs");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function applyQuickRange(hours: QuickRangeHours) {
    setQuickRange(String(hours));
    if (hours === 0) return;
    const w = lastNHoursWindow(hours);
    setFromClock(w.from);
    setToClock(w.to);
  }

  function onFromLocalChange(value: string) {
    const next = datetimeLocalToClock(value);
    if (next) {
      setFromClock(next);
      setQuickRange("custom");
    }
  }

  function onToLocalChange(value: string) {
    const next = datetimeLocalToClock(value);
    if (next) {
      setToClock(next);
      setQuickRange("custom");
    }
  }

  const fromIso = allTime ? null : safeClockToIso(fromClock);
  const toIso = allTime ? null : safeClockToIso(toClock);

  async function runScrape() {
    setScraping(true);
    setError("");
    try {
      // Full catalog from API (no server date/country cuts). All UI filters —
      // including date — apply on the client so changing range never empties
      // the wrong subset.
      const params = new URLSearchParams({
        country: "all",
        work_mode: "all",
        employment_type: "all",
        q: "",
      });

      const res = await fetch(`/api/scrape?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Scrape failed (${res.status})`);
      }

      const nextJobs: CsvJob[] = Array.isArray(data.jobs)
        ? (data.jobs as CsvJob[])
        : [];
      setMeta(data.meta ?? null);
      setJobs(nextJobs);
      const scrapeCountries = data.meta?.countries;
      if (
        Array.isArray(scrapeCountries) &&
        scrapeCountries.length &&
        scrapeCountries.every((c: unknown) => typeof c === "string")
      ) {
        setAllCountries(scrapeCountries as string[]);
      } else {
        setAllCountries(
          [
            ...new Set(
              nextJobs
                .map((j) => j.country)
                .filter((c): c is string => Boolean(c)),
            ),
          ].sort((a, b) => a.localeCompare(b)),
        );
      }

      const nextFromIso = allTime ? null : safeClockToIso(fromClock);
      const nextToIso = allTime ? null : safeClockToIso(toClock);
      const visible = applyLocalFilters(nextJobs, {
        country,
        mode,
        employmentType,
        q,
        fromIso: nextFromIso,
        toIso: nextToIso,
      });
      downloadCsv(
        visible,
        `sme-jobs-${country === "all" ? "all" : country}-${allTime ? "all-time" : fromClock.date}.csv`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scrape failed");
    } finally {
      setScraping(false);
    }
  }

  const countryOptions = useMemo(() => {
    const set = new Set([...allCountries, ...jobs.map((j) => j.country)]);
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [allCountries, jobs]);

  const inRange = useMemo(
    () => jobs.filter((j) => jobInIsoRange(j, fromIso, toIso)),
    [jobs, fromIso, toIso],
  );

  const filtered = useMemo(
    () =>
      applyLocalFilters(jobs, {
        country,
        mode,
        employmentType,
        q,
        fromIso,
        toIso,
      }),
    [jobs, q, mode, country, employmentType, fromIso, toIso],
  );

  const remoteCount = filtered.filter((j) => j.work_mode === "remote").length;
  const hybridCount = filtered.filter((j) => j.work_mode === "hybrid").length;
  const onsiteCount = filtered.filter((j) => j.work_mode === "onsite").length;
  const moreActive = mode !== "all" || employmentType !== "all";
  const rangeLabel = allTime ? "All time" : formatClockRange(fromClock, toClock);

  return (
    <div className={styles.shell}>
      <div className={styles.wrap}>
        <header className={styles.hero}>
          <div className={styles.heroTop}>
            <h1 className={styles.title}>SME-careers</h1>
            <div className={styles.heroMeta}>
              {rangeLabel ? (
                <span className={styles.rangeHint}>{rangeLabel}</span>
              ) : null}
              <a className={styles.handbookLink} href="/handbook">
                Handbook
              </a>
            </div>
          </div>

          <div className={styles.filterBar}>
            <label className={styles.filterItem}>
              <span className={styles.filterLabel}>From</span>
              <input
                type="datetime-local"
                className={styles.control}
                value={clockToDatetimeLocal(fromClock)}
                onChange={(e) => onFromLocalChange(e.target.value)}
                disabled={allTime}
              />
            </label>

            <label className={styles.filterItem}>
              <span className={styles.filterLabel}>To</span>
              <input
                type="datetime-local"
                className={styles.control}
                value={clockToDatetimeLocal(toClock)}
                onChange={(e) => onToLocalChange(e.target.value)}
                disabled={allTime}
              />
            </label>

            <label className={styles.filterItem}>
              <span className={styles.filterLabel}>Quick range</span>
              <select
                className={styles.control}
                value={quickRange}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "custom") {
                    setQuickRange("custom");
                    return;
                  }
                  applyQuickRange(Number(v) as QuickRangeHours);
                }}
              >
                {QUICK_RANGES.map((r) => (
                  <option key={String(r.hours)} value={String(r.hours)}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.filterItem}>
              <span className={styles.filterLabel}>Country</span>
              <select
                className={styles.control}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                <option value="all">All countries</option>
                {countryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.filterActions}>
              <button
                type="button"
                className={`${styles.moreBtn} ${moreActive ? styles.moreBtnActive : ""}`}
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
              >
                More filters{moreActive ? " ·" : ""}
              </button>

              <button
                type="button"
                className={styles.btn}
                onClick={runScrape}
                disabled={scraping}
              >
                {scraping ? "Scraping…" : "Scrape & download CSV"}
              </button>

              <button
                type="button"
                className={styles.btnIcon}
                onClick={() => downloadCsv(filtered, "sme-jobs-filtered.csv")}
                disabled={!filtered.length}
                title="Download current table"
                aria-label="Download current table"
              >
                ↓ CSV
              </button>
            </div>
          </div>

          {moreOpen ? (
            <div className={styles.morePanel}>
              <label className={styles.filterItem}>
                <span className={styles.filterLabel}>Work mode</span>
                <select
                  className={styles.control}
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="all">All modes</option>
                  <option value="remote">remote</option>
                  <option value="hybrid">hybrid</option>
                  <option value="onsite">onsite</option>
                </select>
              </label>
              <label className={styles.filterItem}>
                <span className={styles.filterLabel}>Employment</span>
                <select
                  className={styles.control}
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                >
                  <option value="all">All types</option>
                  <option value="full_time">full_time</option>
                  <option value="part_time">part_time</option>
                  <option value="contract">contract</option>
                  <option value="internship">internship</option>
                </select>
              </label>
            </div>
          ) : null}
        </header>

        <section className={styles.stats} aria-label="Summary">
          <div className={styles.stat}>
            <span className={styles.statLabel}>Showing</span>
            <span className={styles.statValue}>{filtered.length}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>In range</span>
            <span className={styles.statValue}>{inRange.length}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Modes</span>
            <span className={styles.statValue}>
              {remoteCount}r · {hybridCount}h · {onsiteCount}o
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Countries</span>
            <span className={styles.statValue}>{countryOptions.length}</span>
          </div>
        </section>

        <div className={styles.toolbar}>
          <input
            className={styles.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, skills, country…"
            aria-label="Search jobs"
          />
        </div>

        <p className={styles.note}>
          {scraping
            ? "Scraping live from API…"
            : loading
              ? "Loading saved file…"
              : error
                ? error
                : `Loaded ${jobs.length} rows · ${inRange.length} in date range · showing ${filtered.length}` +
                  (meta?.scraped_at
                    ? ` · ${new Date(meta.scraped_at).toLocaleString()}`
                    : "")}
        </p>

        <div className={styles.tableWrap}>
          {!loading && !scraping && filtered.length === 0 ? (
            <div className={styles.empty}>
              No rows for these filters.
              {jobs.length > 0
                ? " Try All time, clear country/mode, or widen the date range — most SME postings are remote; hybrid/onsite are rare."
                : " Run Scrape & download CSV to refresh from the live API."}
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Location</th>
                  <th>Pay</th>
                  <th>Type</th>
                  <th>Posted</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 500).map((job) => (
                  <tr key={job.external_id}>
                    <td>
                      <a
                        className={styles.jobTitle}
                        href={job.apply_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {job.title}
                      </a>
                      <div className={styles.muted}>
                        {(job.skills || "").split("; ").slice(0, 3).join(" · ")}
                      </div>
                    </td>
                    <td>
                      <span className={styles.pill}>{job.work_mode}</span>
                      <div>{job.location}</div>
                      <div className={styles.muted}>{job.country}</div>
                    </td>
                    <td>{money(job)}</td>
                    <td>{job.employment_type}</td>
                    <td>{job.posted_date || "—"}</td>
                    <td className={styles.muted}>
                      {job.external_id.length > 18
                        ? `${job.external_id.slice(0, 18)}…`
                        : job.external_id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className={styles.foot}>
          Country, work mode, employment, search, and date range update the
          table immediately. Scrape refreshes from the live API and downloads
          the filtered CSV. SME&apos;s open feed is almost entirely remote —
          hybrid/onsite only appear when those rare postings exist. Partner
          India file: <code>npm run export:partner</code>.
        </p>
      </div>
    </div>
  );
}
