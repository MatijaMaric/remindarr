import { describe, expect, it } from "bun:test";
import { crc32, createZip, toCsv } from "./zip";
import { readZip } from "../test-utils/read-zip";

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("createZip", () => {
  it("round-trips UTF-8 names and contents with a valid end record", () => {
    const zip = createZip([
      { name: "a.csv", content: "x,y\r\n1,2\r\n" },
      { name: "café.json", content: '{"ok":"日本"}' },
    ]);
    expect(readZip(zip)).toEqual({
      "a.csv": "x,y\r\n1,2\r\n",
      "café.json": '{"ok":"日本"}',
    });
    const end = new DataView(zip.buffer, zip.byteLength - 22);
    expect(end.getUint32(0, true)).toBe(0x06054b50);
    expect(end.getUint16(10, true)).toBe(2);
  });
});

describe("toCsv", () => {
  it("quotes separators, quotes and newlines and blanks nulls", () => {
    expect(toCsv([{ a: 'say "hi", ok', b: null, c: "two\nlines" }])).toBe(
      'a,b,c\r\n"say ""hi"", ok",,"two\nlines"\r\n',
    );
  });

  it("uses the union of keys as the header", () => {
    expect(toCsv([{ a: 1 }, { b: 2 }])).toBe("a,b\r\n1,\r\n,2\r\n");
  });

  it("neutralises spreadsheet formulas in strings but not numbers", () => {
    expect(toCsv([{ a: "=HYPERLINK(1)", b: -3 }])).toBe(
      "a,b\r\n'=HYPERLINK(1),-3\r\n",
    );
  });
});
