/**
 * Mock HTTP listener used by the notification e2e spec.
 *
 * Records every POST it receives. Tests can poll `waitForRequest()` to block
 * until the notification job delivers a webhook. Uses node:http because
 * Playwright globalSetup runs under plain Node, not Bun.
 */
import http from "node:http";

export interface MockWebhookRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  json: unknown;
  receivedAt: number;
}

export interface MockWebhookServer {
  url: string;
  port: number;
  requests: MockWebhookRequest[];
  waitForRequest: (timeoutMs?: number) => Promise<MockWebhookRequest>;
  stop: () => Promise<void>;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

export async function startMockWebhookServer(
  port = 4322
): Promise<MockWebhookServer> {
  const requests: MockWebhookRequest[] = [];

  const server = http.createServer(async (req, res) => {
    // Introspection endpoints for cross-process test workers. These share
    // the listener with the notification webhook target so a single port is
    // enough for the whole fixture.
    if (req.method === "GET" && req.url === "/__requests") {
      const payload = JSON.stringify(requests);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Length", Buffer.byteLength(payload).toString());
      res.end(payload);
      return;
    }
    if (req.method === "POST" && req.url === "/__reset") {
      requests.length = 0;
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(`{"ok":true}`);
      return;
    }

    const body = await readBody(req);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) headers[k] = v.join(",");
      else if (typeof v === "string") headers[k] = v;
    }
    let json: unknown = null;
    try {
      json = body ? JSON.parse(body) : null;
    } catch {
      json = null;
    }
    requests.push({
      method: req.method ?? "",
      url: req.url ?? "",
      headers,
      body,
      json,
      receivedAt: Date.now(),
    });
    const payload = JSON.stringify({ ok: true });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Length", Buffer.byteLength(payload).toString());
    res.end(payload);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  const waitForRequest = (timeoutMs = 15_000): Promise<MockWebhookRequest> => {
    const startedAt = Date.now();
    const initialCount = requests.length;
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (requests.length > initialCount) {
          clearInterval(interval);
          resolve(requests[requests.length - 1]);
          return;
        }
        if (Date.now() - startedAt > timeoutMs) {
          clearInterval(interval);
          reject(new Error(`Timed out after ${timeoutMs}ms waiting for webhook request`));
        }
      }, 100);
    });
  };

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    requests,
    waitForRequest,
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
