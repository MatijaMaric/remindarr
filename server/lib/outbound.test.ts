import { afterEach, expect, test, spyOn } from "bun:test";
import * as dns from "node:dns/promises";
import { CONFIG } from "../config";
import {
  checkOutboundDestination,
  integrationFetch,
  publicAddress,
} from "./outbound";

const saved = [
  CONFIG.OUTBOUND_ALLOWED_ORIGINS,
  CONFIG.OUTBOUND_PRIVATE_ORIGINS,
];
const spies: { mockRestore(): void }[] = [];
afterEach(() => {
  spies.forEach((spy) => spy.mockRestore());
  spies.length = 0;
  [CONFIG.OUTBOUND_ALLOWED_ORIGINS, CONFIG.OUTBOUND_PRIVATE_ORIGINS] = saved;
});

test("non-public addresses and IPv4 encodings cannot bypass the policy", async () => {
  for (const address of [
    "0.0.0.0",
    "127.0.0.1",
    "10.1.1.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.1.1",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "fc00::1",
    "2002:7f00:1::",
  ])
    expect(publicAddress(address)).toBe(false);
  expect(publicAddress("8.8.8.8")).toBe(true);
  expect(publicAddress("2606:4700:4700::1111")).toBe(true);
  expect(publicAddress("2001:4860:4860::8888")).toBe(true);
  expect(publicAddress("2001:db8::1")).toBe(false);
  for (const url of [
    "http://2130706433",
    "http://0x7f000001",
    "http://[::1]",
    "http://localhost",
    "file:///etc/passwd",
    "https://user:pass@discord.com",
  ])
    await expect(checkOutboundDestination(url)).rejects.toThrow();
});

test("only the operator can trust an exact custom origin and private service", async () => {
  spies.push(spyOn(dns, "resolve4").mockResolvedValue(["8.8.8.8"]));
  spies.push(spyOn(dns, "resolve6").mockResolvedValue([]));
  await expect(
    checkOutboundDestination("https://hooks.example/test"),
  ).rejects.toThrow("operator");
  CONFIG.OUTBOUND_ALLOWED_ORIGINS = "https://hooks.example";
  expect(
    (await checkOutboundDestination("https://hooks.example/test")).origin,
  ).toBe("https://hooks.example");
  await expect(
    checkOutboundDestination("https://hooks.example:8443/test"),
  ).rejects.toThrow();
  CONFIG.OUTBOUND_PRIVATE_ORIGINS = "http://127.0.0.1:4322";
  expect(
    (await checkOutboundDestination("http://127.0.0.1:4322/hook")).port,
  ).toBe("4322");
  await expect(
    checkOutboundDestination("http://127.0.0.1:4323/hook"),
  ).rejects.toThrow();
});

test("mixed public/private DNS is rejected even for an allowed origin", async () => {
  spies.push(
    spyOn(dns, "resolve4").mockResolvedValue(["8.8.8.8", "127.0.0.1"]),
  );
  spies.push(spyOn(dns, "resolve6").mockResolvedValue([]));
  await expect(
    checkOutboundDestination("https://discord.com/test"),
  ).rejects.toThrow("public addresses");
});

test("redirects never forward secrets and oversized bodies are cancelled", async () => {
  CONFIG.OUTBOUND_PRIVATE_ORIGINS = "http://127.0.0.1:4322";
  const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { Location: "http://169.254.169.254" },
    }),
  );
  spies.push(fetchSpy);
  await expect(
    integrationFetch("http://127.0.0.1:4322/hook", {
      headers: { Authorization: "Bearer secret" },
    }),
  ).rejects.toThrow("redirects");
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(fetchSpy.mock.calls[0][1]?.redirect).toBe("manual");
  fetchSpy.mockResolvedValue(new Response(new Uint8Array(8 * 1024 * 1024 + 1)));
  await expect(integrationFetch("http://127.0.0.1:4322/hook")).rejects.toThrow(
    "8 MiB",
  );
});
