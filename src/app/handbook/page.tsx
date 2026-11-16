import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { SimpleMarkdown } from "@/lib/simpleMarkdown";
import styles from "./handbook.module.css";

export const metadata: Metadata = {
  title: "SME Careers Scraper — Developer Handbook",
  description:
    "Developer handbook for the SME Careers job scrape desk: architecture, APIs, CSV mapping, Vercel",
};

export const dynamic = "force-static";

const NAV: { sec: string; links: { href: string; label: string }[] }[] = [
  {
    sec: "Start",
    links: [
      { href: "#1-overview", label: "1. Overview" },
      { href: "#2-where-it-runs", label: "2. Where it runs" },
      { href: "#3-quick-start", label: "3. Quick start" },
      { href: "#4-mental-model", label: "4. Mental model" },
    ],
  },
  {
    sec: "Architecture",
    links: [
      { href: "#5-project-map-src", label: "5. Project map" },
      { href: "#6-how-the-scraper-works", label: "6. How the scraper works" },
      { href: "#10-modules-deep-dive", label: "10. Modules deep-dive" },
    ],
  },
  {
    sec: "Product",
    links: [
      { href: "#7-dashboard-features", label: "7. Dashboard features" },
      { href: "#8-api-reference", label: "8. API reference" },
      { href: "#9-csv-schema--mapping", label: "9. CSV schema & mapping" },
    ],
  },
  {
    sec: "Ship",
    links: [
      { href: "#11-playwright--ci", label: "11. Playwright & CI" },
      { href: "#12-ship-on-vercel", label: "12. Ship on Vercel" },
      { href: "#13-troubleshooting", label: "13. Troubleshooting" },
      { href: "#14-this-handbook-hosting", label: "14. Handbook hosting" },
      { href: "#15-onboarding-checklist", label: "15. Onboarding checklist" },
      { href: "#16-glossary", label: "16. Glossary" },
    ],
  },
];

async function loadHandbook(): Promise<string> {
  return readFile(path.join(process.cwd(), "HANDBOOK.md"), "utf8");
}

export default async function HandbookPage() {
  const source = await loadHandbook();

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <Link href="/" className={styles.brand}>
            SME Careers Scraper
          </Link>
          <p className={styles.tag}>Developer Handbook</p>
          <nav>
            {NAV.map((group) => (
              <div key={group.sec}>
                <div className={styles.sec}>{group.sec}</div>
                {group.links.map((l) => (
                  <a key={l.href} className={styles.navLink} href={l.href}>
                    {l.label}
                  </a>
                ))}
              </div>
            ))}
          </nav>
          <Link href="/" className={styles.dashLink}>
            ← Back to dashboard
          </Link>
        </aside>

        <main className={styles.main}>
          <div className={styles.content}>
            <header className={styles.hero} id="top">
              <h1>SME Careers Scraper Developer Handbook</h1>
              <p className={styles.lede}>
                The complete guide for engineers working on the{" "}
                <strong>SME-careers</strong> job scrape desk (Next.js on
                Vercel). It explains how the scraper is shaped, how jobs are
                fetched and mapped to CSV, how the dashboard and APIs work, and
                how to ship — so a new developer can operate the project without
                tribal knowledge.
              </p>
              <div className={styles.metaRow}>
                <span className={styles.pill}>Dashboard → Vercel</span>
                <span className={styles.pill}>API /api/scrape</span>
                <span className={styles.pill}>CSV = upload contract</span>
                <span className={styles.pill}>Source sme.careers/jobs</span>
                <span className={styles.pill}>Handbook → /handbook</span>
              </div>
            </header>

            <article className={styles.doc}>
              <SimpleMarkdown source={source} skipFirstH1 />
            </article>

            <footer className={styles.foot}>
              SME Careers Scraper Developer Handbook — served at{" "}
              <a href="/handbook">/handbook</a> from <code>HANDBOOK.md</code>.{" "}
              <a href="#top">Back to top</a>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
