import { describe, it, expect, beforeEach } from "bun:test";
import { Counter, Gauge, Histogram } from "./registry";

describe("Counter", () => {
  let counter: Counter;

  beforeEach(() => {
    counter = new Counter("test_total", "Test counter");
  });

  it("renders zero when no observations", () => {
    const out = counter.render();
    expect(out).toContain("# HELP test_total Test counter");
    expect(out).toContain("# TYPE test_total counter");
    expect(out).toContain("test_total 0");
  });

  it("increments without labels", () => {
    counter.inc();
    counter.inc();
    const out = counter.render();
    expect(out).toContain("test_total 2");
  });

  it("increments with labels", () => {
    counter.inc({ method: "GET", status: "200" });
    counter.inc({ method: "GET", status: "200" });
    counter.inc({ method: "POST", status: "201" });
    const out = counter.render();
    expect(out).toContain('test_total{method="GET",status="200"} 2');
    expect(out).toContain('test_total{method="POST",status="201"} 1');
  });

  it("increments by custom amount", () => {
    counter.inc({}, 5);
    expect(counter.render()).toContain("test_total 5");
  });

  it("resets values", () => {
    counter.inc();
    counter.reset();
    expect(counter.render()).toContain("test_total 0");
  });

  it("escapes label values", () => {
    counter.inc({ label: 'val"ue' });
    expect(counter.render()).toContain('label="val\\"ue"');
  });

  it("sorts labels alphabetically for consistent keys", () => {
    counter.inc({ z: "1", a: "2" });
    const out = counter.render();
    expect(out).toContain('test_total{a="2",z="1"} 1');
  });
});

describe("Gauge", () => {
  let gauge: Gauge;

  beforeEach(() => {
    gauge = new Gauge("test_gauge", "Test gauge");
  });

  it("renders zero when not set", () => {
    const out = gauge.render();
    expect(out).toContain("# TYPE test_gauge gauge");
    expect(out).toContain("test_gauge 0");
  });

  it("sets a value", () => {
    gauge.set({}, 42);
    expect(gauge.render()).toContain("test_gauge 42");
  });

  it("sets with labels", () => {
    gauge.set({ kind: "active" }, 7);
    expect(gauge.render()).toContain('test_gauge{kind="active"} 7');
  });

  it("overwrites previous value", () => {
    gauge.set({}, 10);
    gauge.set({}, 5);
    expect(gauge.render()).toContain("test_gauge 5");
  });

  it("resets values", () => {
    gauge.set({}, 99);
    gauge.reset();
    expect(gauge.render()).toContain("test_gauge 0");
  });
});

describe("Histogram", () => {
  let hist: Histogram;

  beforeEach(() => {
    hist = new Histogram("test_duration_seconds", "Test histogram", [0.01, 0.1, 1]);
  });

  it("renders no data when no observations", () => {
    const out = hist.render();
    expect(out).toContain("# TYPE test_duration_seconds histogram");
    // No data lines when no observations
    expect(out).not.toContain("_bucket");
  });

  it("records observations into cumulative buckets", () => {
    hist.observe({}, 0.005); // falls in le=0.01, 0.1, 1 buckets
    hist.observe({}, 0.05);  // falls in le=0.1, 1 buckets
    hist.observe({}, 0.5);   // falls in le=1 bucket only

    const out = hist.render();
    expect(out).toContain('test_duration_seconds_bucket{le="0.01"} 1');
    expect(out).toContain('test_duration_seconds_bucket{le="0.1"} 2');
    expect(out).toContain('test_duration_seconds_bucket{le="1"} 3');
    expect(out).toContain('test_duration_seconds_bucket{le="+Inf"} 3');
    expect(out).toContain("test_duration_seconds_count 3");
  });

  it("records sum correctly", () => {
    hist.observe({}, 0.1);
    hist.observe({}, 0.2);
    const out = hist.render();
    expect(out).toContain("test_duration_seconds_sum 0.30000000000000004"); // floating point
  });

  it("records observations with labels", () => {
    hist.observe({ method: "GET" }, 0.005);
    hist.observe({ method: "POST" }, 0.5);

    const out = hist.render();
    expect(out).toContain('test_duration_seconds_bucket{method="GET",le="0.01"} 1');
    expect(out).toContain('test_duration_seconds_bucket{method="POST",le="0.01"} 0');
    expect(out).toContain('test_duration_seconds_bucket{method="POST",le="1"} 1');
  });

  it("resets data", () => {
    hist.observe({}, 0.5);
    hist.reset();
    const out = hist.render();
    expect(out).not.toContain("_bucket");
  });
});
