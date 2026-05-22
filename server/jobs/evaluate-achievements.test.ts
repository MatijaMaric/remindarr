import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, upsertTitles } from "../db/repository";
import { makeParsedTitle } from "../test-utils/fixtures";
import * as achievementsRepo from "../db/repository/achievements";
import * as evaluate from "../achievements/evaluate";

// Import the handler registration side effect — this calls registerHandler()
import "../jobs/evaluate-achievements";

// Retrieve the registered handler via the exported getHandler
import { getHandler } from "./worker";

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash", "Test User");
  await upsertTitles([
    makeParsedTitle({
      id: "movie-1",
      objectType: "MOVIE",
      title: "Test Movie",
    }),
  ]);
});

afterEach(() => {
  teardownTestDb();
});

function makeJob(data: Record<string, unknown>) {
  return {
    id: 1,
    name: "evaluate-achievements",
    data: JSON.stringify(data),
    status: "running" as const,
    attempts: 1,
    max_attempts: 3,
    error: null,
    run_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    completed_at: null,
    created_at: new Date().toISOString(),
  };
}

describe("evaluate-achievements job handler", () => {
  it("is registered and callable via getHandler", () => {
    const handler = getHandler("evaluate-achievements");
    expect(handler).toBeDefined();
    expect(typeof handler).toBe("function");
  });

  it("evaluates count_movies kind and calls upsertUserAchievement", async () => {
    const handler = getHandler("evaluate-achievements")!;
    const upsertSpy = spyOn(
      achievementsRepo,
      "upsertUserAchievement",
    ).mockResolvedValue({ newlyEarned: false });
    const evalSpy = spyOn(evaluate, "evaluateCountMovies").mockResolvedValue({
      progress: 5,
      earned: false,
    });

    await handler(
      makeJob({ userId, kinds: ["count_movies"], titleId: undefined }),
    );

    expect(evalSpy).toHaveBeenCalled();
    expect(upsertSpy).toHaveBeenCalled();

    // Verify upsert was called with the right userId and a non-null key
    const calls = upsertSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0]).toBe(userId);
    expect(typeof calls[0][1]).toBe("string"); // key

    upsertSpy.mockRestore();
    evalSpy.mockRestore();
  });

  it("evaluates count_episodes kind and calls upsertUserAchievement", async () => {
    const handler = getHandler("evaluate-achievements")!;
    const upsertSpy = spyOn(
      achievementsRepo,
      "upsertUserAchievement",
    ).mockResolvedValue({ newlyEarned: true });
    const evalSpy = spyOn(evaluate, "evaluateCountEpisodes").mockResolvedValue({
      progress: 100,
      earned: true,
    });

    await handler(
      makeJob({ userId, kinds: ["count_episodes"], titleId: undefined }),
    );

    expect(evalSpy).toHaveBeenCalled();
    expect(upsertSpy).toHaveBeenCalled();

    // Verify earnedAt is a non-null ISO string when earned=true
    const calls = upsertSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // earnedAt (4th arg) should be a string (ISO date) when earned=true
    expect(typeof calls[0][3]).toBe("string");

    upsertSpy.mockRestore();
    evalSpy.mockRestore();
  });

  it("skips speed_binge_season when titleId is missing", async () => {
    const handler = getHandler("evaluate-achievements")!;
    const evalSpeedSpy = spyOn(
      evaluate,
      "evaluateSpeedBingeSeason",
    ).mockResolvedValue({ progress: 0, earned: false });
    const upsertSpy = spyOn(
      achievementsRepo,
      "upsertUserAchievement",
    ).mockResolvedValue({ newlyEarned: false });

    await handler(
      makeJob({ userId, kinds: ["speed_binge_season"], titleId: undefined }),
    );

    // speed_binge_season without titleId should be skipped
    expect(evalSpeedSpy).not.toHaveBeenCalled();

    upsertSpy.mockRestore();
    evalSpeedSpy.mockRestore();
  });

  it("evaluates speed_binge_season when titleId is provided", async () => {
    const handler = getHandler("evaluate-achievements")!;
    const evalSpeedSpy = spyOn(
      evaluate,
      "evaluateSpeedBingeSeason",
    ).mockResolvedValue({ progress: 3, earned: false });
    const upsertSpy = spyOn(
      achievementsRepo,
      "upsertUserAchievement",
    ).mockResolvedValue({ newlyEarned: false });

    await handler(
      makeJob({ userId, kinds: ["speed_binge_season"], titleId: "movie-1" }),
    );

    expect(evalSpeedSpy).toHaveBeenCalled();
    expect(upsertSpy).toHaveBeenCalled();

    upsertSpy.mockRestore();
    evalSpeedSpy.mockRestore();
  });

  it("gracefully handles invalid job data without crashing", async () => {
    const handler = getHandler("evaluate-achievements")!;
    const upsertSpy = spyOn(
      achievementsRepo,
      "upsertUserAchievement",
    ).mockResolvedValue({ newlyEarned: false });

    // Missing userId
    await handler(makeJob({ kinds: ["count_movies"] }));
    expect(upsertSpy).not.toHaveBeenCalled();

    // Missing kinds array
    await handler(makeJob({ userId }));
    expect(upsertSpy).not.toHaveBeenCalled();

    upsertSpy.mockRestore();
  });

  it("sets earnedAt to null when achievement is not yet earned", async () => {
    const handler = getHandler("evaluate-achievements")!;
    const upsertSpy = spyOn(
      achievementsRepo,
      "upsertUserAchievement",
    ).mockResolvedValue({ newlyEarned: false });
    const evalSpy = spyOn(evaluate, "evaluateCountMovies").mockResolvedValue({
      progress: 2,
      earned: false,
    });

    await handler(
      makeJob({ userId, kinds: ["count_movies"], titleId: undefined }),
    );

    const calls = upsertSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // earnedAt (4th arg) should be null when earned=false
    expect(calls[0][3]).toBeNull();

    upsertSpy.mockRestore();
    evalSpy.mockRestore();
  });
});
