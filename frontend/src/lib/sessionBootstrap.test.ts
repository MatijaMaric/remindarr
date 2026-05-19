import { describe, it, expect } from "bun:test";
import { classifySession, resolveSession } from "./sessionBootstrap";

const noop = () => Promise.resolve();

describe("classifySession", () => {
  it("classifies a thrown error as indeterminate", () => {
    expect(classifySession(undefined, true)).toBe("indeterminate");
  });

  it("classifies a 503 server error as indeterminate", () => {
    expect(classifySession({ data: null, error: { status: 503 } }, false)).toBe("indeterminate");
  });

  it("classifies a status-0 network error as indeterminate", () => {
    expect(classifySession({ data: null, error: { status: 0 } }, false)).toBe("indeterminate");
  });

  it("classifies an error with no status as indeterminate", () => {
    expect(classifySession({ data: null, error: {} }, false)).toBe("indeterminate");
  });

  it("classifies a 401 as unauthenticated (definitive)", () => {
    expect(classifySession({ data: null, error: { status: 401 } }, false)).toBe("unauthenticated");
  });

  it("classifies a 403 as unauthenticated (definitive)", () => {
    expect(classifySession({ data: null, error: { status: 403 } }, false)).toBe("unauthenticated");
  });

  it("classifies null data with no error as unauthenticated", () => {
    expect(classifySession({ data: null, error: null }, false)).toBe("unauthenticated");
  });

  it("classifies a result with user data as authenticated", () => {
    expect(classifySession({ data: { user: { id: "u1" } }, error: null }, false)).toBe("authenticated");
  });
});

describe("resolveSession", () => {
  it("returns authenticated on the first call and does not retry", async () => {
    let callCount = 0;
    const result = await resolveSession(
      () => {
        callCount++;
        return Promise.resolve({ data: { user: { id: "u1" } }, error: null });
      },
      { retries: 3, sleep: noop }
    );
    expect(result.verdict).toBe("authenticated");
    expect(callCount).toBe(1);
  });

  it("returns unauthenticated on 401 without retrying", async () => {
    let callCount = 0;
    const result = await resolveSession(
      () => {
        callCount++;
        return Promise.resolve({ data: null, error: { status: 401 } });
      },
      { retries: 3, sleep: noop }
    );
    expect(result.verdict).toBe("unauthenticated");
    expect(callCount).toBe(1);
  });

  it("retries on network rejection and returns authenticated after recovery", async () => {
    let callCount = 0;
    const result = await resolveSession(
      () => {
        callCount++;
        if (callCount < 3) return Promise.reject(new Error("network error"));
        return Promise.resolve({ data: { user: { id: "u1" } }, error: null });
      },
      { retries: 3, sleep: noop }
    );
    expect(result.verdict).toBe("authenticated");
    expect(callCount).toBe(3);
  });

  it("returns indeterminate after exhausting all retries on 503", async () => {
    let callCount = 0;
    const result = await resolveSession(
      () => {
        callCount++;
        return Promise.resolve({ data: null, error: { status: 503 } });
      },
      { retries: 3, sleep: noop }
    );
    expect(result.verdict).toBe("indeterminate");
    expect(callCount).toBe(3);
  });
});
