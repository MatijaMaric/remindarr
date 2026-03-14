import { describe, it, expect, mock, beforeEach } from "bun:test";
import { Logger } from "./logger";

describe("Logger", () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    const capture =
      () =>
      (...args: unknown[]) => {
        logs.push(args[0] as string);
      };
    console.log = capture();
    console.error = capture();
  });

  it("outputs structured JSON", () => {
    const log = new Logger("debug");
    log.info("hello");
    expect(logs).toHaveLength(1);
    const entry = JSON.parse(logs[0]);
    expect(entry.level).toBe("info");
    expect(entry.msg).toBe("hello");
    expect(entry.time).toBeDefined();
  });

  it("respects log level threshold", () => {
    const log = new Logger("warn");
    log.debug("skip");
    log.info("skip");
    log.warn("keep");
    log.error("keep");
    expect(logs).toHaveLength(2);
  });

  it("includes bindings from child loggers", () => {
    const log = new Logger("debug").child({ module: "test-mod" });
    log.info("hi");
    const entry = JSON.parse(logs[0]);
    expect(entry.module).toBe("test-mod");
  });

  it("serializes Error objects", () => {
    const log = new Logger("debug");
    log.error("fail", { error: new Error("boom") });
    const entry = JSON.parse(logs[0]);
    expect(entry.error.message).toBe("boom");
    expect(entry.error.stack).toBeDefined();
  });

  it("includes extra data fields", () => {
    const log = new Logger("debug");
    log.info("ctx", { userId: 42, action: "click" });
    const entry = JSON.parse(logs[0]);
    expect(entry.userId).toBe(42);
    expect(entry.action).toBe("click");
  });
});
