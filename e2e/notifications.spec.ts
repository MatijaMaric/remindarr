import { test, expect, request as requestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { registerUser } from "./fixtures/auth";
import { MOCK_WEBHOOK_STATE_FILE } from "./fixtures/constants";
import type { MockWebhookRequest } from "./fixtures/mock-webhook";

function loadWebhookUrl(): string {
  const raw = fs.readFileSync(path.resolve(MOCK_WEBHOOK_STATE_FILE), "utf-8");
  return (JSON.parse(raw) as { url: string }).url;
}

async function waitForWebhookRequest(
  webhookUrl: string,
  sinceTs: number,
  timeoutMs = 15_000
): Promise<MockWebhookRequest> {
  const ctx = await requestContext.newContext();
  try {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const res = await ctx.get(`${webhookUrl}/__requests`);
      if (res.ok()) {
        const reqs = (await res.json()) as MockWebhookRequest[];
        const match = reqs.find((r) => r.method === "POST" && r.receivedAt > sinceTs);
        if (match) return match;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for webhook request`);
  } finally {
    await ctx.dispose();
  }
}

test.describe("Webhook notifications", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "HTTP-only flow; running once is sufficient"
  );

  test("webhook notifier delivers test payload to mock listener", async ({ request }) => {
    const webhookUrl = loadWebhookUrl();
    const user = await registerUser(request);

    const createRes = await request.post("/api/notifiers", {
      data: {
        provider: "webhook",
        config: { url: webhookUrl },
      },
      headers: { "Content-Type": "application/json" },
    });
    expect(createRes.ok()).toBeTruthy();
    const created = (await createRes.json()) as {
      notifier: { id: string; provider: string };
    };
    expect(created.notifier.provider).toBe("webhook");

    const beforeTs = Date.now();
    const testRes = await request.post(`/api/notifiers/${created.notifier.id}/test`);
    expect(testRes.ok()).toBeTruthy();
    const testBody = (await testRes.json()) as { success: boolean; message?: string };
    expect(testBody.success, `test endpoint failed: ${testBody.message}`).toBe(true);

    const received = await waitForWebhookRequest(webhookUrl, beforeTs);
    expect(received.method).toBe("POST");
    const json = received.json as {
      source?: string;
      title?: string;
      episodes?: unknown[];
    } | null;
    expect(json?.source).toBe("remindarr");
    expect(typeof json?.title).toBe("string");
    expect(Array.isArray(json?.episodes)).toBeTruthy();

    // Leave things tidy: delete the notifier we created.
    await request.delete(`/api/notifiers/${created.notifier.id}`);
    expect(user.username).toBeTruthy();
  });
});
