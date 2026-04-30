import { describe, it, expect, spyOn, beforeEach } from "bun:test";

// Mock Sentry before any other imports that might trigger it
import Sentry from "../sentry";
spyOn(Sentry, "startSpan").mockImplementation((_opts: any, fn: any) => fn({}));
spyOn(Sentry, "captureException").mockImplementation(() => "");

import * as http from "../lib/http";
import { getServers } from "./client";

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("getServers()", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    fetchSpy = spyOn(http, "httpFetch");
  });

  it("returns only resources whose provides field includes 'server'", async () => {
    const resources = [
      {
        name: "My Server",
        clientIdentifier: "abc123",
        provides: "server",
        connections: [{ uri: "http://192.168.1.10:32400", local: true, relay: false }],
      },
      {
        name: "My Player",
        clientIdentifier: "def456",
        provides: "player",
        connections: [],
      },
      {
        name: "Server and Player",
        clientIdentifier: "ghi789",
        provides: "server,player",
        connections: [{ uri: "http://192.168.1.11:32400", local: true, relay: false }],
      },
    ];

    fetchSpy.mockResolvedValue(makeResponse(resources));

    const result = await getServers("test-token");

    expect(result).toHaveLength(2);
    expect(result.map((s) => s.clientIdentifier)).toEqual(["abc123", "ghi789"]);
  });

  it("returns an empty array when no resources have provides containing 'server'", async () => {
    const resources = [
      {
        name: "Player Only",
        clientIdentifier: "ppp111",
        provides: "player",
        connections: [],
      },
      {
        name: "No provides",
        clientIdentifier: "ppp222",
        connections: [],
      },
    ];

    fetchSpy.mockResolvedValue(makeResponse(resources));

    const result = await getServers("test-token");

    expect(result).toHaveLength(0);
  });

  it("returns an empty array when the API returns an empty list", async () => {
    fetchSpy.mockResolvedValue(makeResponse([]));

    const result = await getServers("test-token");

    expect(result).toHaveLength(0);
  });
});
