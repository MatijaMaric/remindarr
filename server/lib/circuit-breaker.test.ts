import { describe, it, expect, beforeEach } from "bun:test";
import { CircuitBreaker, BreakerOpenError, getBreaker, _resetBreakersForTest } from "./circuit-breaker";
import { resetMetrics, circuitBreakerStateChangesTotal } from "../metrics";

// Helpers
function makeBreaker(overrides?: { threshold?: number; windowMs?: number; openMs?: number }) {
  let t = 0;
  const now = () => t;
  const advanceMs = (ms: number) => { t += ms; };
  const breaker = new CircuitBreaker("test.host", {
    failureThreshold: overrides?.threshold ?? 3,
    failureWindowMs: overrides?.windowMs ?? 10_000,
    defaultOpenDurationMs: overrides?.openMs ?? 5_000,
    now,
  });
  return { breaker, advanceMs };
}

beforeEach(() => {
  _resetBreakersForTest();
  resetMetrics();
});

describe("CircuitBreaker — closed state", () => {
  it("stays closed under the threshold", () => {
    const { breaker } = makeBreaker();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(() => breaker.beforeCall()).not.toThrow();
  });

  it("opens when failure threshold is reached", () => {
    const { breaker } = makeBreaker();
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(() => breaker.beforeCall()).toThrow(BreakerOpenError);
  });

  it("does not count failures older than the window", () => {
    const { breaker, advanceMs } = makeBreaker({ threshold: 3, windowMs: 10_000 });
    breaker.recordFailure();
    breaker.recordFailure();
    advanceMs(11_000);       // first two failures slide out of the window
    breaker.recordFailure(); // only 1 in-window failure
    expect(() => breaker.beforeCall()).not.toThrow();
  });

  it("opens for the default duration", () => {
    const { breaker, advanceMs } = makeBreaker({ threshold: 2, openMs: 60_000 });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(() => breaker.beforeCall()).toThrow(BreakerOpenError);
    advanceMs(59_999);
    expect(() => breaker.beforeCall()).toThrow(BreakerOpenError);
  });

  it("opens for a custom duration when supplied to recordFailure", () => {
    const { breaker, advanceMs } = makeBreaker({ threshold: 2, openMs: 5_000 });
    const LONG = 86_400_000; // 24h
    breaker.recordFailure(LONG);
    breaker.recordFailure(LONG);
    expect(() => breaker.beforeCall()).toThrow(BreakerOpenError);
    advanceMs(30_000); // well past 5s default, still under 24h
    expect(() => breaker.beforeCall()).toThrow(BreakerOpenError);
  });

  it("resets failure count after recordSuccess", () => {
    const { breaker } = makeBreaker({ threshold: 3 });
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess(); // closed → still closed, history cleared
    breaker.recordFailure();
    breaker.recordFailure();
    expect(() => breaker.beforeCall()).not.toThrow();
  });
});

describe("CircuitBreaker — open state", () => {
  it("rejects calls with BreakerOpenError while open", () => {
    const { breaker } = makeBreaker({ threshold: 2 });
    breaker.recordFailure();
    breaker.recordFailure();
    const err = (() => { try { breaker.beforeCall(); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(BreakerOpenError);
    expect((err as BreakerOpenError).host).toBe("test.host");
  });

  it("transitions to half-open after open duration elapses", () => {
    const { breaker, advanceMs } = makeBreaker({ threshold: 2, openMs: 1_000 });
    breaker.recordFailure();
    breaker.recordFailure();
    advanceMs(1_001);
    expect(() => breaker.beforeCall()).not.toThrow(); // half-open probe admitted
  });
});

describe("CircuitBreaker — half-open state", () => {
  function openedBreaker() {
    const { breaker, advanceMs } = makeBreaker({ threshold: 2, openMs: 1_000 });
    breaker.recordFailure();
    breaker.recordFailure();
    advanceMs(1_001);
    return { breaker, advanceMs };
  }

  it("admits exactly one probe call", () => {
    const { breaker } = openedBreaker();
    expect(() => breaker.beforeCall()).not.toThrow(); // probe
    expect(() => breaker.beforeCall()).toThrow(BreakerOpenError); // second concurrent call blocked
  });

  it("closes on probe success and clears failure history", () => {
    const { breaker } = openedBreaker();
    breaker.beforeCall();    // probe admitted
    breaker.recordSuccess(); // probe success
    expect(() => breaker.beforeCall()).not.toThrow();
    expect(() => breaker.beforeCall()).not.toThrow(); // subsequent calls normal
  });

  it("re-opens on probe failure with the supplied duration", () => {
    const LONG = 10_000;
    const { breaker, advanceMs } = openedBreaker();
    breaker.beforeCall();             // probe admitted
    breaker.recordFailure(LONG);      // probe fails
    expect(() => breaker.beforeCall()).toThrow(BreakerOpenError);
    advanceMs(5_000);
    expect(() => breaker.beforeCall()).toThrow(BreakerOpenError); // still open
  });

  it("re-opens on probe failure for the default duration when none supplied", () => {
    const { breaker, advanceMs } = makeBreaker({ threshold: 2, openMs: 2_000 });
    breaker.recordFailure();
    breaker.recordFailure();
    advanceMs(2_001);
    breaker.beforeCall();        // probe admitted
    breaker.recordFailure();     // probe fails — re-open for another 2s
    expect(() => breaker.beforeCall()).toThrow(BreakerOpenError);
    advanceMs(2_001);
    expect(() => breaker.beforeCall()).not.toThrow(); // half-open again
  });
});

describe("CircuitBreaker — registry isolation", () => {
  it("getBreaker returns the same instance for the same host", () => {
    const a = getBreaker("host-a");
    const b = getBreaker("host-a");
    expect(a).toBe(b);
  });

  it("getBreaker keeps different hosts isolated", () => {
    const opts = { failureThreshold: 2, failureWindowMs: 10_000, defaultOpenDurationMs: 5_000 };
    // Open the breaker for host-x
    const x = getBreaker("host-x", opts);
    x.recordFailure();
    x.recordFailure();
    // host-y should still be closed
    const y = getBreaker("host-y", opts);
    expect(() => y.beforeCall()).not.toThrow();
  });

  it("_resetBreakersForTest clears the registry", () => {
    const first = getBreaker("clean-host");
    _resetBreakersForTest();
    const second = getBreaker("clean-host");
    expect(first).not.toBe(second);
  });
});

describe("CircuitBreaker — metrics", () => {
  it("increments counter on state transitions", () => {
    const { breaker, advanceMs } = makeBreaker({ threshold: 2, openMs: 1_000 });
    breaker.recordFailure();
    breaker.recordFailure(); // closed → open
    advanceMs(1_001);
    breaker.beforeCall();    // open → half-open
    breaker.recordSuccess(); // half-open → closed
    const rendered = circuitBreakerStateChangesTotal.render();
    expect(rendered).toContain('to="open"');
    expect(rendered).toContain('to="half-open"');
    expect(rendered).toContain('to="closed"');
  });
});
