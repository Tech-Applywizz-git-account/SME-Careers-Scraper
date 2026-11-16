export const CSV_HEADERS = [
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
] as const;

export type CsvHeader = (typeof CSV_HEADERS)[number];

export type CsvJob = Record<CsvHeader, string> & {
  /** ISO timestamp for client date filtering (not exported in CSV) */
  posted_at?: string;
};

export type ScrapeFilters = {
  from: string;
  to: string;
  country: string;
  work_mode: string;
  employment_type: string;
  q: string;
};

export type ScrapeMeta = {
  scraped_at: string;
  source_url: string;
  total: number;
  unique: number;
  filters?: ScrapeFilters;
  countries?: string[];
};

export type JobsPayload = {
  meta: ScrapeMeta;
  jobs: CsvJob[];
};

export type RawSmeJob = {
  jobPostingId?: string;
  externalKey?: string;
  title?: string;
  description?: string;
  requirements?: string[];
  responsibilities?: string[];
  skills?: Array<{ name?: string } | string>;
  aiSuggestedSkills?: string[];
  employmentType?: string;
  workLocation?: string;
  experienceLevel?: string;
  currencyCode?: string;
  payUnit?: string;
  rateMin?: number | null;
  rateMax?: number | null;
  hourlyRateMin?: number | null;
  hourlyRateMax?: number | null;
  country?: { name?: string; countryCode?: string } | null;
  countries?: Array<{ name?: string; countryCode?: string }>;
  countryCode?: string;
  state?: { name?: string } | null;
  city?: { name?: string } | null;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
};
