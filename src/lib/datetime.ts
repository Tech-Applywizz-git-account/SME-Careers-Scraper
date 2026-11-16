export type Meridiem = "AM" | "PM";

export type ClockValue = {
  date: string; // YYYY-MM-DD
  hour: string; // 1-12
  minute: string; // 00-59
  meridiem: Meridiem;
};

/** Hours for quick ranges (168 = 7 days) */
export type QuickRangeHours = 1 | 6 | 12 | 24 | 48 | 72 | 168;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local date parts from a Date */
export function toClockValue(d: Date): ClockValue {
  let h = d.getHours();
  const meridiem: Meridiem = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    hour: String(h),
    minute: pad2(d.getMinutes()),
    meridiem,
  };
}

export function lastNHoursWindow(
  hours: number,
): { from: ClockValue; to: ClockValue } {
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
  return { from: toClockValue(from), to: toClockValue(to) };
}

export function last12HoursWindow() {
  return lastNHoursWindow(12);
}

export function normalizeHour(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 2);
  if (!digits) return "";
  const n = Number(digits);
  if (n < 1) return "1";
  if (n > 12) return "12";
  return String(n);
}

export function normalizeMinute(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 2);
  if (!digits) return "";
  const n = Number(digits);
  if (n > 59) return "59";
  return pad2(n);
}

export function normalizeDate(raw: string): string {
  const cleaned = raw.trim().replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  return cleaned.slice(0, 10);
}

/** Convert 12h clock (local) → ISO string for API filter */
export function clockToIso(value: ClockValue): string {
  const date = normalizeDate(value.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Date must be YYYY-MM-DD");
  }
  let hour = Number(normalizeHour(value.hour) || value.hour);
  const minute = Number(normalizeMinute(value.minute) || value.minute);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12) {
    throw new Error("Hour must be 1–12");
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error("Minute must be 0–59");
  }

  if (value.meridiem === "AM") {
    hour = hour === 12 ? 0 : hour;
  } else {
    hour = hour === 12 ? 12 : hour + 12;
  }

  const [y, m, d] = date.split("-").map(Number);
  const local = new Date(y, m - 1, d, hour, minute, 0, 0);
  if (Number.isNaN(local.getTime())) throw new Error("Invalid date/time");
  return local.toISOString();
}

/** ClockValue → value for <input type="datetime-local"> */
export function clockToDatetimeLocal(value: ClockValue): string {
  const date = normalizeDate(value.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  let hour = Number(normalizeHour(value.hour) || value.hour);
  const minute = Number(normalizeMinute(value.minute) || value.minute || "0");
  if (!Number.isFinite(hour) || hour < 1 || hour > 12) return "";
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return "";
  if (value.meridiem === "AM") {
    hour = hour === 12 ? 0 : hour;
  } else {
    hour = hour === 12 ? 12 : hour + 12;
  }
  return `${date}T${pad2(hour)}:${pad2(minute)}`;
}

/** <input type="datetime-local"> → ClockValue (local timezone preserved) */
export function datetimeLocalToClock(value: string): ClockValue | null {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, date, hh, mm] = m;
  const hour24 = Number(hh);
  if (Number.isNaN(hour24) || hour24 < 0 || hour24 > 23) return null;
  const meridiem: Meridiem = hour24 >= 12 ? "PM" : "AM";
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return {
    date,
    hour: String(hour12),
    minute: mm,
    meridiem,
  };
}

export function formatClockRange(from: ClockValue, to: ClockValue): string {
  const fmt = (c: ClockValue) => {
    if (!c.date) return "";
    const [, m, d] = c.date.split("-");
    return `${m}/${d} ${c.hour}:${normalizeMinute(c.minute) || "00"} ${c.meridiem}`;
  };
  const a = fmt(from);
  const b = fmt(to);
  if (!a || !b) return "";
  return `${a} – ${b}`;
}

export const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
export const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i));

export const QUICK_RANGES: { hours: QuickRangeHours | "custom"; label: string }[] =
  [
    { hours: 1, label: "Last 1 hr" },
    { hours: 6, label: "Last 6 hrs" },
    { hours: 12, label: "Last 12 hrs" },
    { hours: 24, label: "Last 24 hrs" },
    { hours: 168, label: "Last 7 days" },
    { hours: "custom", label: "Custom" },
  ];
