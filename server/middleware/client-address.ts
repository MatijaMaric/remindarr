import { isIP } from "node:net";

function normalize(address: string): string {
  return address.startsWith("::ffff:") && isIP(address.slice(7)) === 4
    ? address.slice(7)
    : address;
}

/** Trust exact operator-configured proxy addresses; walk the chain from the peer. */
export function bunClientAddress(
  peer: string | undefined,
  forwarded: string | undefined,
  trustedProxies: string[] = [],
): string {
  if (!peer || !isIP(peer)) return "anonymous";
  const trusted = new Set(trustedProxies.map(normalize));
  let address = normalize(peer);
  if (!trusted.has(address) || !forwarded) return address;
  const chain = forwarded.split(",").map((part) => part.trim());
  if (chain.some((part) => !isIP(part))) return address;
  for (const hop of chain.reverse()) {
    if (!trusted.has(address)) break;
    address = normalize(hop);
  }
  return address;
}
