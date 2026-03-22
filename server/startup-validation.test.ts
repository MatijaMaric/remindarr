import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { CONFIG } from "./config";

const originalTmdbApiKey = CONFIG.TMDB_API_KEY;
const originalDbPath = CONFIG.DB_PATH;

// Mock process.exit so tests don't actually terminate
const mockExit = spyOn(process, "exit").mockImplementation((() => {
  throw new Error("process.exit called");
}) as never);

// Suppress logger output during tests
const mockConsoleError = spyOn(console, "error").mockImplementation(() => {});
const mockConsoleLog = spyOn(console, "log").mockImplementation(() => {});

describe("validateStartup", () => {
  afterEach(() => {
    CONFIG.TMDB_API_KEY = originalTmdbApiKey;
    CONFIG.DB_PATH = originalDbPath;
    mockExit.mockClear();
  });

  it("exits when TMDB_API_KEY is not set", async () => {
    CONFIG.TMDB_API_KEY = "";
    const { validateStartup } = await import("./startup-validation");
    expect(() => validateStartup()).toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("exits when DB directory is not writable", async () => {
    CONFIG.TMDB_API_KEY = "test-key";
    CONFIG.DB_PATH = "/nonexistent-dir-abc123/remindarr.db";
    const { validateStartup } = await import("./startup-validation");
    expect(() => validateStartup()).toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("passes validation when config is valid", async () => {
    CONFIG.TMDB_API_KEY = "test-key";
    CONFIG.DB_PATH = "./remindarr.db";
    const { validateStartup } = await import("./startup-validation");
    expect(() => validateStartup()).not.toThrow();
    expect(mockExit).not.toHaveBeenCalled();
  });
});
