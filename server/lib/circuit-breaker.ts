import { logger } from "../logger";
import { circuitBreakerStateChangesTotal } from "../metrics";

const log = logger.child({ module: "circuit-breaker" });

const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_MS = 60_000;
const DEFAULT_OPEN_DURATION_MS = 5 * 60_000;

type State = "closed" | "open" | "half-open";

export class BreakerOpenError extends Error {
  override name = "BreakerOpenError";
  constructor(
    public readonly host: string,
    public readonly openUntil: number,
  ) {
    super(`Circuit breaker open for ${host} until ${new Date(openUntil).toISOString()}`);
  }
}

interface BreakerOpts {
  failureThreshold?: number;
  failureWindowMs?: number;
  defaultOpenDurationMs?: number;
  // Inject for deterministic tests; defaults to Date.now.
  now?: () => number;
}

export class CircuitBreaker {
  private state: State = "closed";
  private failures: number[] = [];
  private openUntil = 0;
  private halfOpenInFlight = false;

  private readonly threshold: number;
  private readonly windowMs: number;
  private readonly defaultOpenMs: number;
  private readonly now: () => number;

  constructor(
    private readonly host: string,
    opts?: BreakerOpts,
  ) {
    this.threshold = opts?.failureThreshold ?? FAILURE_THRESHOLD;
    this.windowMs = opts?.failureWindowMs ?? FAILURE_WINDOW_MS;
    this.defaultOpenMs = opts?.defaultOpenDurationMs ?? DEFAULT_OPEN_DURATION_MS;
    this.now = opts?.now ?? (() => Date.now());
  }

  beforeCall(): void {
    const now = this.now();
    if (this.state === "closed") return;
    if (this.state === "open") {
      if (now < this.openUntil) {
        throw new BreakerOpenError(this.host, this.openUntil);
      }
      // Cooldown elapsed — transition to half-open and admit one probe.
      if (!this.halfOpenInFlight) {
        this.transition("open", "half-open");
        this.halfOpenInFlight = true;
        return;
      }
      throw new BreakerOpenError(this.host, this.openUntil);
    }
    // half-open: only one in-flight probe allowed.
    if (!this.halfOpenInFlight) {
      this.halfOpenInFlight = true;
      return;
    }
    throw new BreakerOpenError(this.host, this.openUntil);
  }

  recordSuccess(): void {
    if (this.state === "half-open") {
      this.transition("half-open", "closed");
    }
    this.failures = [];
    this.halfOpenInFlight = false;
  }

  recordFailure(openDurationMs?: number): void {
    const now = this.now();
    const duration = openDurationMs ?? this.defaultOpenMs;

    if (this.state === "half-open") {
      this.openUntil = now + duration;
      this.halfOpenInFlight = false;
      this.transition("half-open", "open");
      return;
    }

    this.failures.push(now);
    // Prune failures outside the sliding window.
    this.failures = this.failures.filter((t) => now - t <= this.windowMs);

    if (this.failures.length >= this.threshold) {
      this.openUntil = now + duration;
      this.failures = [];
      this.transition("closed", "open");
    }
  }

  private transition(from: State, to: State): void {
    this.state = to;
    circuitBreakerStateChangesTotal.inc({ host: this.host, from, to });
    if (to === "open") {
      log.warn("Circuit breaker opened", { host: this.host, openUntil: new Date(this.openUntil).toISOString() });
    } else if (to === "half-open") {
      log.info("Circuit breaker half-open, probing", { host: this.host });
    } else if (to === "closed") {
      log.info("Circuit breaker closed", { host: this.host });
    }
  }
}

// In-memory per-host registry. State is per-isolate — acceptable for background jobs.
const registry = new Map<string, CircuitBreaker>();

export function getBreaker(host: string, opts?: BreakerOpts): CircuitBreaker {
  let breaker = registry.get(host);
  if (!breaker) {
    breaker = new CircuitBreaker(host, opts);
    registry.set(host, breaker);
  }
  return breaker;
}

export function _resetBreakersForTest(): void {
  registry.clear();
}
