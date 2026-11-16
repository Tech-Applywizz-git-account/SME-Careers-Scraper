"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../app/page.module.css";
import {
  QUICK_RANGES,
  clockToDatetimeLocal,
  clockToIso,
  datetimeLocalToClock,
  formatClockRange,
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
  },
): CsvJob[] {
  const needle = opts.q.trim().toLowerCase();
  return list.filter((job) => {
    if (opts.mode !== "all" && job.work_mode !== opts.mode) return false;
    if (opts.country !== "all" && job.country !== opts.country) return false;
    if (
      opts.employmentType !== "all" &&
      job.employment_type !== opts.employmentType
    ) {
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
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

export default function Dashboard() {
  const initial = lastNHoursWindow(12);
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
  const [quickRange, setQuickRange] = useState<string>("12");
  const [moreOpen, setMoreOpen] = useState(false);
  const [fromClock, setFromClock] = useState<ClockValue>(initial.from);
  const [toClock, setToClock] = useState<ClockValue>(initial.to);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/data/jobs.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`Could not load jobs (${res.status})`);
        const data = await res.json();
        if (!alive) return;
        setMeta(data.meta ?? null);
        setJobs(Array.isArray(data.jobs) ? data.jobs : []);
        const fromMeta = data.meta?.countries;
        if (Array.isArray(fromMeta) && fromMeta.length) {
          setAllCountries(fromMeta);
        } else {
          setAllCountries(
            [
              ...new Set(
                (data.jobs ?? []).map((j: CsvJob) => j.country).filter(Boolean),
              ),
            ].sort((a: string, b: string) => a.localeCompare(b)),
          );
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
    const w = lastNHoursWindow(hours);
    setFromClock(w.from);
    setToClock(w.to);
    setQuickRange(String(hours));
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

  async function runScrape() {
    setScraping(true);
    setError("");
    try {
      const fromIso = clockToIso(fromClock);
      const toIso = clockToIso(toClock);
      // Date window from API with ALL countries so the country dropdown
      // can filter live. Country / mode / employment / search apply after.
      const params = new URLSearchParams({
        from: fromIso,
        to: toIso,
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

      const nextJobs: CsvJob[] = Array.isArray(data.jobs) ? data.jobs : [];
      setMeta(data.meta ?? null);
      setJobs(nextJobs);
      if (Array.isArray(data.meta?.countries) && data.meta.countries.length) {
        setAllCountries(data.meta.countries);
      } else {
        setAllCountries(
          [
            ...new Set(nextJobs.map((j) => j.country).filter(Boolean)),
          ].sort((a, b) => a.localeCompare(b)),
        );
      }

      const visible = applyLocalFilters(nextJobs, {
        country,
        mode,
        employmentType,
        q,
      });
      downloadCsv(
        visible,
        `sme-jobs-${country === "all" ? "all" : country}-${fromClock.date}.csv`,
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

  const filtered = useMemo(
    () => applyLocalFilters(jobs, { country, mode, employmentType, q }),
    [jobs, q, mode, country, employmentType],
  );

  const remoteCount = filtered.filter((j) => j.work_mode === "remote").length;
  const moreActive = mode !== "all" || employmentType !== "all";
  const rangeLabel = formatClockRange(fromClock, toClock);

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
              />
            </label>

            <label className={styles.filterItem}>
              <span className={styles.filterLabel}>To</span>
              <input
                type="datetime-local"
                className={styles.control}
                value={clockToDatetimeLocal(toClock)}
                onChange={(e) => onToLocalChange(e.target.value)}
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
            <span className={styles.statValue}>{jobs.length}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Remote</span>
            <span className={styles.statValue}>{remoteCount}</span>
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
            ? "Scraping live from API (all countries in date range)…"
            : loading
              ? "Loading saved file…"
              : error
                ? error
                : `API scrape loaded ${jobs.length} rows in date range · showing ${filtered.length} after country/mode filters` +
                  (meta?.scraped_at
                    ? ` · ${new Date(meta.scraped_at).toLocaleString()}`
                    : "")}
        </p>

        <div className={styles.tableWrap}>
          {!loading && !scraping && filtered.length === 0 ? (
            <div className={styles.empty}>
              No rows for these filters. Adjust range/country and scrape again.
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
          Data comes from the live <code>/api/scrape</code> API (not a static
          CSV). Date range needs Scrape; country / mode / employment / search
          update the table immediately. Partner India file:{" "}
          <code>npm run export:partner</code>.
        </p>
      </div>
    </div>
  );
}
