import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import { render, cleanup, screen, act } from "@testing-library/react";
import EpisodeCountdown from "./EpisodeCountdown";

afterEach(cleanup);

// Helper: build an ISO date string N milliseconds from now
function msFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

describe("EpisodeCountdown", () => {
  describe("null / past air dates", () => {
    it("shows TBA when airDate is null", () => {
      render(<EpisodeCountdown airDate={null} />);
      expect(screen.getByText("TBA")).toBeTruthy();
    });

    it("shows TBA when airDate is undefined", () => {
      render(<EpisodeCountdown airDate={undefined} />);
      expect(screen.getByText("TBA")).toBeTruthy();
    });

    it("shows TBA when airDate is more than 15 minutes in the past", () => {
      const past = msFromNow(-20 * 60 * 1000);
      render(<EpisodeCountdown airDate={past} />);
      expect(screen.getByText("TBA")).toBeTruthy();
    });
  });

  describe("future air dates", () => {
    it("shows countdown when airDate is 2+ days in the future", () => {
      const future = msFromNow(2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000);
      render(<EpisodeCountdown airDate={future} />);
      const badge = document.querySelector("span");
      // Should contain "d" for days
      expect(badge?.textContent).toMatch(/\d+d/);
    });

    it("shows hours format when less than 1 day remains", () => {
      const future = msFromNow(3 * 60 * 60 * 1000 + 20 * 60 * 1000);
      render(<EpisodeCountdown airDate={future} />);
      const badge = document.querySelector("span");
      expect(badge?.textContent).toMatch(/\d+h/);
    });

    it("shows minutes format when less than 1 hour remains", () => {
      const future = msFromNow(5 * 60 * 1000 + 30 * 1000);
      render(<EpisodeCountdown airDate={future} />);
      const badge = document.querySelector("span");
      expect(badge?.textContent).toMatch(/\d+m/);
    });

    it("shows seconds when less than 1 minute remains", () => {
      const future = msFromNow(45 * 1000);
      render(<EpisodeCountdown airDate={future} />);
      const badge = document.querySelector("span");
      expect(badge?.textContent).toMatch(/\d+s/);
    });
  });

  describe("interval updates", () => {
    let originalSetInterval: typeof setInterval;
    let originalClearInterval: typeof clearInterval;
    let intervalCallbacks: Map<number, () => void>;
    let nextId: number;

    beforeEach(() => {
      intervalCallbacks = new Map();
      nextId = 1;
      originalSetInterval = globalThis.setInterval;
      originalClearInterval = globalThis.clearInterval;

      // @ts-expect-error patching global for test
      globalThis.setInterval = (cb: () => void, _delay: number) => {
        const id = nextId++;
        intervalCallbacks.set(id, cb);
        return id;
      };
      // @ts-expect-error patching global for test
      globalThis.clearInterval = (id: number) => {
        intervalCallbacks.delete(id);
      };
    });

    afterEach(() => {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    });

    it("ticks without crashing while still in future", () => {
      const future = msFromNow(2 * 24 * 60 * 60 * 1000);
      render(<EpisodeCountdown airDate={future} />);

      act(() => {
        for (const cb of intervalCallbacks.values()) cb();
      });

      // Still shows days countdown after one tick
      const badge = document.querySelector("span");
      expect(badge?.textContent).toMatch(/\d+d/);
    });

    it("shows TBA when Date.now() moves past the 15-min window", () => {
      const future = msFromNow(1000);
      render(<EpisodeCountdown airDate={future} />);

      // Advance Date.now to 20 minutes after airDate
      const realDateNow = Date.now;
      Date.now = () => new Date(future).getTime() + 20 * 60 * 1000;

      act(() => {
        for (const cb of intervalCallbacks.values()) cb();
      });

      Date.now = realDateNow;

      expect(screen.getByText("TBA")).toBeTruthy();
    });
  });

  describe("accessibility", () => {
    it("renders a span element as the badge root", () => {
      const future = msFromNow(5 * 60 * 60 * 1000);
      const { container } = render(<EpisodeCountdown airDate={future} />);
      expect(container.firstChild?.nodeName).toBe("SPAN");
    });
  });
});
