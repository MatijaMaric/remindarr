import { describe, it, expect } from "bun:test";
import { urlBase64ToUint8Array } from "./push";

describe("urlBase64ToUint8Array", () => {
  it("converts a base64url string to Uint8Array", () => {
    // Known test vector: "AQAB" (base64url) = [1, 0, 1]
    const result = urlBase64ToUint8Array("AQAB");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(1);
  });

  it("handles base64url characters (- and _)", () => {
    // "-" should become "+" and "_" should become "/"
    const result = urlBase64ToUint8Array("A-B_");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(3);
  });

  it("adds padding as needed", () => {
    // "AA" needs 2 padding chars
    const result = urlBase64ToUint8Array("AA");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result[0]).toBe(0);
  });
});
