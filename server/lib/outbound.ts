import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";
import { CONFIG } from "../config";

// Fixed service origins are maintained by the application. Custom destinations
// (including public ones) must be trusted by the operator, not an account owner.
const services = new Set([
  "https://discord.com",
  "https://discordapp.com",
  "https://api.telegram.org",
  "https://ntfy.sh",
  "https://plex.tv",
  "https://metadata.provider.plex.tv",
  "https://fcm.googleapis.com",
  "https://updates.push.services.mozilla.com",
  "https://web.push.apple.com",
]);

export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  // Only global unicast IPv6, excluding transition/documentation allocations.
  const normalized = address.toLowerCase();
  const [prefix, subnet] = normalized.split(":");
  return (
    isIP(address) === 6 &&
    /^[23]/.test(normalized) &&
    !(
      prefix === "2001" &&
      (parseInt(subnet || "0", 16) < 0x200 || subnet === "db8")
    ) &&
    !/^2002:/.test(normalized) &&
    !/^3fff:/.test(normalized)
  );
}

function origins(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const url = new URL(entry);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.pathname !== "/" ||
          url.search ||
          url.hash
        )
          throw new Error("Invalid operator outbound origin");
        return url.origin;
      }),
  );
}

export async function checkOutboundDestination(input: string): Promise<URL> {
  const url = new URL(input);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Integration destination must use HTTP(S) without URL credentials",
    );
  const privateOrigins = origins(CONFIG.OUTBOUND_PRIVATE_ORIGINS);
  if (privateOrigins.has(url.origin)) return url;
  if (
    !services.has(url.origin) &&
    !origins(CONFIG.OUTBOUND_ALLOWED_ORIGINS).has(url.origin)
  )
    throw new Error("Integration destination is not allowed by the operator");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [hostname]
    : (
        await Promise.all([
          resolve4(hostname).catch(() => [] as string[]),
          resolve6(hostname).catch(() => [] as string[]),
        ])
      ).flat();
  if (!addresses.length || addresses.some((address) => !publicAddress(address)))
    throw new Error(
      "Integration destination does not resolve exclusively to public addresses",
    );
  return url;
}

export async function integrationFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  const signal = init.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;
  try {
    signal.throwIfAborted();
    const url = await Promise.race([
      checkOutboundDestination(input),
      new Promise<never>((_, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(new Error("Integration request timed out")),
          { once: true },
        ),
      ),
    ]);
    signal.throwIfAborted();
    const response = await fetch(url.toString(), {
      ...init,
      redirect: "manual",
      signal,
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Error(
        "Integration redirects are not allowed; configure the final destination",
      );
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Integration response exceeds 8 MiB");
        }
        chunks.push(value);
      }
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    return new Response(
      [204, 205, 304].includes(response.status) ? null : body,
      {
        status: response.status,
        headers: response.headers,
      },
    );
  } catch (error) {
    if (signal.aborted)
      throw new Error("Integration request timed out or was cancelled");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
