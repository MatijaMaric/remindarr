import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { MemoryCache } from "./memory";
import { CloudflareKvCache } from "./cloudflare-kv";
import { initCache, getCache, runWithCache } from "./index";

// ─── MemoryCache ────────────────────────────────────────────────────────────

describe("MemoryCache", () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache(5, 60_000);
  });

  afterEach(async () => {
    await cache.close();
  });

  it("returns null for missing keys", async () => {
    expect(await cache.get("nonexistent")).toBeNull();
  });

  it("stores and retrieves string values", async () => {
    await cache.set("key", "hello", 60);
    expect(await cache.get<string>("key")).toBe("hello");
  });

  it("stores and retrieves object values", async () => {
    const obj = { id: 1, name: "Test", nested: { a: true } };
    await cache.set("obj", obj, 60);
    expect(await cache.get<typeof obj>("obj")).toEqual(obj);
  });

  it("stores and retrieves array values", async () => {
    const arr = [[1, "Action"], [2, "Comedy"]] as [number, string][];
    await cache.set("arr", arr, 60);
    expect(await cache.get<[number, string][]>("arr")).toEqual(arr);
  });

  it("returns null for expired entries", async () => {
    await cache.set("expiring", "value", 0); // 0 second TTL
    // Wait a tick for expiry
    await Bun.sleep(5);
    expect(await cache.get("expiring")).toBeNull();
  });

  it("deletes entries", async () => {
    await cache.set("key", "value", 60);
    await cache.delete("key");
    expect(await cache.get("key")).toBeNull();
  });

  it("evicts oldest entries when at max capacity", async () => {
    // Max is 5
    for (let i = 0; i < 5; i++) {
      await cache.set(`key-${i}`, i, 60);
    }
    // Adding a 6th should evict the first
    await cache.set("key-5", 5, 60);
    expect(await cache.get("key-0")).toBeNull();
    expect(await cache.get<number>("key-5")).toBe(5);
  });

  it("does not evict when updating existing key at capacity", async () => {
    for (let i = 0; i < 5; i++) {
      await cache.set(`key-${i}`, i, 60);
    }
    // Update existing key should not evict
    await cache.set("key-0", "updated", 60);
    expect(await cache.get<string>("key-0")).toBe("updated");
    expect(await cache.get<number>("key-1")).toBe(1);
  });

  it("close clears timers and store", async () => {
    await cache.set("key", "value", 60);
    await cache.close();
    expect(await cache.get("key")).toBeNull();
  });

  it("round-trips complex nested data through JSON serialization", async () => {
    const data = {
      genres: [[28, "Action"], [35, "Comedy"]] as [number, string][],
      providers: [{ id: 8, name: "Netflix", iconUrl: "/nf.png" }],
      empty: null,
      flag: false,
      count: 0,
    };
    await cache.set("complex", data, 60);
    expect(await cache.get<typeof data>("complex")).toEqual(data);
  });
});

// ─── CloudflareKvCache ──────────────────────────────────────────────────────

describe("CloudflareKvCache", () => {
  let cache: CloudflareKvCache;
  let mockKv: {
    get: ReturnType<typeof mock>;
    put: ReturnType<typeof mock>;
    delete: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    mockKv = {
      get: mock(() => Promise.resolve(null)),
      put: mock(() => Promise.resolve()),
      delete: mock(() => Promise.resolve()),
    };
    cache = new CloudflareKvCache(mockKv as unknown as KVNamespace);
  });

  it("returns null on cache miss", async () => {
    mockKv.get.mockResolvedValueOnce(null);
    expect(await cache.get("missing")).toBeNull();
    expect(mockKv.get).toHaveBeenCalledWith("missing", "text");
  });

  it("returns parsed value on cache hit", async () => {
    const data = { id: 1, name: "Test" };
    mockKv.get.mockResolvedValueOnce(JSON.stringify(data));
    expect(await cache.get<typeof data>("key")).toEqual(data);
  });

  it("stores value with TTL via put", async () => {
    await cache.set("key", { hello: "world" }, 300);
    expect(mockKv.put).toHaveBeenCalledWith(
      "key",
      JSON.stringify({ hello: "world" }),
      { expirationTtl: 300 },
    );
  });

  it("deletes key", async () => {
    await cache.delete("key");
    expect(mockKv.delete).toHaveBeenCalledWith("key");
  });

  it("returns null for invalid JSON", async () => {
    mockKv.get.mockResolvedValueOnce("not-valid-json{");
    expect(await cache.get("bad")).toBeNull();
  });
});

// ─── Cache accessor (getCache / initCache / runWithCache) ───────────────────

describe("cache accessor", () => {
  it("getCache returns the singleton set by initCache", () => {
    const mem = new MemoryCache(10);
    initCache(mem);
    expect(getCache()).toBe(mem);
  });

  it("runWithCache overrides the singleton for the duration of the callback", async () => {
    const singleton = new MemoryCache(10);
    const perRequest = new MemoryCache(10);
    initCache(singleton);

    expect(getCache()).toBe(singleton);

    await runWithCache(perRequest, async () => {
      expect(getCache()).toBe(perRequest);
    });

    // Back to singleton after runWithCache
    expect(getCache()).toBe(singleton);
  });
});

// ─── RedisCache (mock-based) ────────────────────────────────────────────────

describe("RedisCache", () => {
  it("is importable and has correct interface shape", async () => {
    const { RedisCache } = await import("./redis");
    expect(RedisCache).toBeDefined();
    expect(RedisCache.prototype.get).toBeInstanceOf(Function);
    expect(RedisCache.prototype.set).toBeInstanceOf(Function);
    expect(RedisCache.prototype.delete).toBeInstanceOf(Function);
    expect(RedisCache.prototype.close).toBeInstanceOf(Function);
  });
});
