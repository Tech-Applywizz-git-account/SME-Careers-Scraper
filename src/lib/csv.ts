import { CSV_HEADERS, type CsvJob } from "./types";

function escapeCell(value: string): string {
  const text = value ?? "";
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(jobs: CsvJob[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const job of jobs) {
    lines.push(CSV_HEADERS.map((h) => escapeCell(job[h] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}
