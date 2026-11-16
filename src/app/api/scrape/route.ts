import { NextRequest, NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import { scrapeJobs } from "@/lib/scrapeJobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/scrape
 *
 * Query params:
 * - from          ISO datetime (optional)
 * - to            ISO datetime (optional)
 * - country       "all" or country name (default all)
 * - work_mode     all | remote | hybrid | onsite
 * - employment_type  all | full_time | part_time | contract | internship
 * - q             search text
 * - format        json | csv (default json)
 *
 * Examples:
 * /api/scrape?from=2026-11-15T10:00:00.000Z&to=2026-11-16T10:00:00.000Z&country=all
 * /api/scrape?country=India&work_mode=remote&format=csv
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const country = sp.get("country") ?? "all";
  const work_mode = sp.get("work_mode") ?? "all";
  const employment_type = sp.get("employment_type") ?? "all";
  const q = sp.get("q") ?? "";
  const format = sp.get("format") ?? "json";

  try {
    const data = await scrapeJobs({
      from,
      to,
      country,
      work_mode,
      employment_type,
      q,
    });

    if (format === "csv") {
      const name = ["sme-jobs", country === "all" ? "all" : country, "export"]
        .join("-")
        .replace(/\s+/g, "_");
      return new NextResponse(toCsv(data.jobs), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}.csv"`,
          "Cache-Control": "no-store",
          "X-Jobs-Count": String(data.jobs.length),
        },
      });
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Scrape failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
