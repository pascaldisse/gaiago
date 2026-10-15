import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compressCaryll, expandCaryll } from "../src/index.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("caryll (reversible dictionary codec)", () => {
  test("round-trips SPEC.md exactly", () => {
    const text = read("../SPEC.md");
    expect(expandCaryll(compressCaryll(text).output)).toBe(text);
  });
  test("round-trips README.md exactly", () => {
    const text = read("../README.md");
    expect(expandCaryll(compressCaryll(text).output)).toBe(text);
  });
  test("compresses repetitive input and stays lossless", () => {
    const phrase = "carries durable context across rooms";
    const text = Array.from({ length: 30 }, (_, i) => `${i}: ${phrase}.`).join("\n");
    const { output, stats } = compressCaryll(text);
    expect(stats.tokensAfter).toBeLessThan(stats.tokensBefore);
    expect(stats.legendEntries).toBeGreaterThan(0);
    expect(expandCaryll(output)).toBe(text);
  });
  test("preserves code fences, inline code and URLs verbatim; avoids alias collisions", () => {
    const phrase = "carries durable context across rooms";
    const text = [
      "~A1 already exists, so the default alias prefix must collide.",
      Array.from({ length: 12 }, () => `${phrase}.`).join(" "),
      `\`${phrase}\` stays inline.`,
      "```ts",
      `const sample = '${phrase}';`,
      "```",
      `https://example.test/memory/service/${phrase.replace(/ /g, "/")} stays URL.`,
    ].join("\n");
    const { output } = compressCaryll(text);
    expect(expandCaryll(output)).toBe(text);
    expect(output).toMatch(/^~caryll\/1\n~L ~B1=/m);
    expect(output).not.toMatch(/^~L ~A1=/m);
    expect(output).toContain(`\`${phrase}\``);
  });
  test("incompressible input still round-trips", () => {
    expect(expandCaryll(compressCaryll("short").output)).toBe("short");
    expect(expandCaryll(compressCaryll("").output)).toBe("");
  });
  test("rejects a missing header", () => {
    expect(() => expandCaryll("not-caryll\n~~\nbody")).toThrow(/~caryll\/1/);
  });
});
