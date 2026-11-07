import { crc32 } from "../lib/zip";

/** Reads the STORE entries back out of a zip produced by createZip. */
export function readZip(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const out: Record<string, string> = {};
  let pos = 0;
  while (view.getUint32(pos, true) === 0x04034b50) {
    const crc = view.getUint32(pos + 14, true);
    const size = view.getUint32(pos + 18, true);
    const nameLen = view.getUint16(pos + 26, true);
    const name = dec.decode(bytes.subarray(pos + 30, pos + 30 + nameLen));
    const data = bytes.subarray(pos + 30 + nameLen, pos + 30 + nameLen + size);
    if (crc32(data) !== crc) throw new Error(`bad crc for ${name}`);
    out[name] = dec.decode(data);
    pos += 30 + nameLen + size;
  }
  return out;
}
