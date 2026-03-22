import { Counter, Gauge, Histogram, DB_BUCKETS } from "./registry";

// ─── HTTP Metrics ────────────────────────────────────────────────────────────

export const httpRequestsTotal = new Counter(
  "http_requests_total",
  "Total number of HTTP requests",
);

export const httpRequestDurationSeconds = new Histogram(
  "http_request_duration_seconds",
  "HTTP request latency in seconds",
);

// ─── DB Metrics ──────────────────────────────────────────────────────────────

export const dbQueryDurationSeconds = new Histogram(
  "db_query_duration_seconds",
  "Database query duration in seconds",
  DB_BUCKETS,
);

// ─── Job Metrics ─────────────────────────────────────────────────────────────

export const jobsTotal = new Counter(
  "jobs_total",
  "Total number of job executions",
);

export const jobDurationSeconds = new Histogram(
  "job_duration_seconds",
  "Job execution duration in seconds",
);

// ─── TMDB Metrics ────────────────────────────────────────────────────────────

export const tmdbRequestsTotal = new Counter(
  "tmdb_requests_total",
  "Total number of TMDB API requests",
);

export const tmdbRequestDurationSeconds = new Histogram(
  "tmdb_request_duration_seconds",
  "TMDB API request duration in seconds",
);

// ─── Session Gauge ───────────────────────────────────────────────────────────

export const activeSessionsGauge = new Gauge(
  "active_sessions",
  "Number of currently active (non-expired) user sessions",
);

// ─── Registry ────────────────────────────────────────────────────────────────

const allMetrics = [
  httpRequestsTotal,
  httpRequestDurationSeconds,
  dbQueryDurationSeconds,
  jobsTotal,
  jobDurationSeconds,
  tmdbRequestsTotal,
  tmdbRequestDurationSeconds,
  activeSessionsGauge,
];

export function renderMetrics(): string {
  return allMetrics.map((m) => m.render()).join("\n\n") + "\n";
}

export function resetMetrics(): void {
  for (const m of allMetrics) {
    m.reset();
  }
}
