import { describe, it, expect, spyOn, afterEach } from "bun:test";
import Sentry from "./sentry";
import { traceDbQuery, traceHttp } from "./tracing";

describe("traceDbQuery", () => {
  let startSpanSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    startSpanSpy?.mockRestore();
  });

  it("calls Sentry.startSpan with db.query op and returns result", () => {
    startSpanSpy = spyOn(Sentry, "startSpan").mockImplementation(
      (_opts: any, fn: any) => fn({})
    );
    const result = traceDbQuery("getProviders", () => [{ id: 1 }]);
    expect(result).toEqual([{ id: 1 }]);
    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    const opts = (startSpanSpy.mock.calls[0] as any[])[0];
    expect(opts.op).toBe("db.query");
    expect(opts.name).toBe("getProviders");
    expect(opts.attributes["db.system"]).toBe("sqlite");
  });

  it("propagates errors from the callback", () => {
    startSpanSpy = spyOn(Sentry, "startSpan").mockImplementation(
      (_opts: any, fn: any) => fn({})
    );
    expect(() =>
      traceDbQuery("failing", () => {
        throw new Error("db error");
      })
    ).toThrow("db error");
  });
});

describe("traceHttp", () => {
  let startSpanSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    startSpanSpy?.mockRestore();
  });

  it("calls Sentry.startSpan with http.client op and returns result", async () => {
    startSpanSpy = spyOn(Sentry, "startSpan").mockImplementation(
      (_opts: any, fn: any) => fn({})
    );
    const result = await traceHttp(
      "GET",
      "https://api.example.com/data?q=1",
      async () => ({ ok: true })
    );
    expect(result).toEqual({ ok: true });
    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    const opts = (startSpanSpy.mock.calls[0] as any[])[0];
    expect(opts.op).toBe("http.client");
    expect(opts.name).toBe("GET /data");
    expect(opts.attributes["http.method"]).toBe("GET");
    expect(opts.attributes["server.address"]).toBe("api.example.com");
  });

  it("propagates errors from the async callback", async () => {
    startSpanSpy = spyOn(Sentry, "startSpan").mockImplementation(
      (_opts: any, fn: any) => fn({})
    );
    await expect(
      traceHttp("POST", "https://example.com/fail", async () => {
        throw new Error("timeout");
      })
    ).rejects.toThrow("timeout");
  });
});
