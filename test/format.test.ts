import { describe, expect, test } from "bun:test";
import { decodeGaiago, encodeGaiago, formatIfLarge, isGaiago, parseGaiago, savings } from "../src/index.ts";

describe("encodeGaiago", () => {
  test("bash → numbered graph rows, blanks dropped, lines trimmed", () => {
    const out = encodeGaiago("bash", "one\n\n two\n");
    expect(out).toBe("真 bash · 行=2 · 詳=none\n1→one\n2→two");
  });
  test("non-bash payload is preserved byte-for-byte", () => {
    const text = "  keep\n\n  whitespace  \n";
    expect(encodeGaiago("read", text)).toBe(`真 read · 行=2 · 詳=none\n${text}`);
  });
  test("ERROR prefix → 失 status", () => {
    expect(encodeGaiago("edit", "ERROR: nope").startsWith("失 edit")).toBe(true);
  });
  test("detail keys are listed", () => {
    expect(encodeGaiago("web", "x", { ok: true, provider: "brave" })).toContain("詳=ok,provider");
  });
  test("empty payload → ∅", () => {
    expect(encodeGaiago("bash", "\n\n")).toBe("真 bash · 行=0 · 詳=none\n∅");
  });
});

describe("decodeGaiago", () => {
  test("exact round-trip for non-bash verbs", () => {
    for (const text of ["a\nb", "  x  \n\n\ny\n", "鳴語 → graph", "1→looks like a row"]) {
      expect(decodeGaiago(encodeGaiago("read", text))).toBe(text);
    }
  });
  test("bash round-trips to the NORMALISED lines (documented loss)", () => {
    expect(decodeGaiago(encodeGaiago("bash", "one\n\n  two  \nthree"))).toBe("one\ntwo\nthree");
  });
  test("bash row containing → survives", () => {
    expect(decodeGaiago(encodeGaiago("bash", "a→b"))).toBe("a→b");
  });
  test("rejects malformed frames", () => {
    expect(() => decodeGaiago("not a frame")).toThrow();
    expect(() => decodeGaiago("真 bash · 行=1 · 詳=none\nno-number")).toThrow(/graph row/);
  });
  test("parseGaiago exposes header fields", () => {
    const f = parseGaiago(encodeGaiago("web", "hi", { a: 1, b: 2 }));
    expect(f).toMatchObject({ status: "真", verb: "web", lines: 1, detailKeys: ["a", "b"], payload: "hi" });
  });
  test("isGaiago", () => {
    expect(isGaiago(encodeGaiago("bash", "x"))).toBe(true);
    expect(isGaiago("plain text")).toBe(false);
  });
});

describe("formatIfLarge", () => {
  const big = Array.from({ length: 400 }, (_, i) => `        row ${i}        `).join("\n\n");
  test("below threshold → untouched", () => {
    expect(formatIfLarge("bash", "small", undefined, { thresholdBytes: 100 })).toBe("small");
  });
  test("above threshold → framed", () => {
    expect(formatIfLarge("bash", big, undefined, { thresholdBytes: 100 }).startsWith("真 bash")).toBe(true);
  });
  test("raw bypasses; threshold 0 frames everything", () => {
    expect(formatIfLarge("bash", big, undefined, { raw: true, thresholdBytes: 0 })).toBe(big);
    expect(formatIfLarge("bash", "x", undefined, { thresholdBytes: 0 }).startsWith("真")).toBe(true);
  });
  test("savings reports byte counts for padded bash output", () => {
    const s = savings("bash", big);
    expect(s.before).toBeGreaterThan(s.after);
    expect(s.saved).toBe(s.before - s.after);
  });
});
