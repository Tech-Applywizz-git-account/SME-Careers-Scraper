import { toCsv } from "./csv";
import type { CsvJob } from "./types";

/** Build a CSV file in the browser and trigger download (works on Vercel). */
export function downloadCsv(jobs: CsvJob[], filename = "sme-jobs.csv") {
  const csv = toCsv(jobs);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
