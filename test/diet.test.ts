import { describe, expect, test } from "bun:test";
import { DEFAULT_POLICY, decayPreview, parseStub, recentEventIds, type DietPolicy } from "../src/index.ts";

const on: DietPolicy = { ...DEFAULT_POLICY, preset: true };
const preview = "bash({\"command\":\"ls\"})\nline1\nline2\nline3\nline4";
const ctx = { isOwn: true, isRecentEvent: false, eventId: "ev1", toolId: "t9" };

describe("decayPreview", () => {
  test("preset off → passthrough", () => {
    expect(decayPreview(preview, DEFAULT_POLICY, ctx)).toBe(preview);
  });
  test("own + recent → full", () => {
    expect(decayPreview(preview, on, { ...ctx, isRecentEvent: true })).toBe(preview);
  });
  test("own + keepAllToolCalls → full", () => {
    expect(decayPreview(preview, { ...on, keepAllToolCalls: true }, ctx)).toBe(preview);
  });
  test("own + old → one-line stub with retrieval handle", () => {
    const out = decayPreview(preview, on, ctx);
    expect(out.split("\n")).toHaveLength(1);
    expect(out.startsWith('bash({"command":"ls"}) …')).toBe(true);
    expect(parseStub(out)).toEqual({ sessionId: "ev1", entryId: "t9" });
  });
  test("other agent → last N lines, min 1", () => {
    const other = { ...ctx, isOwn: false };
    expect(decayPreview(preview, { ...on, toolTailLines: 2 }, other)).toBe("line3\nline4");
    expect(decayPreview(preview, { ...on, toolTailLines: 0 }, other)).toBe("line4");
  });
});

describe("recentEventIds", () => {
  test("last N ids", () => {
    expect([...recentEventIds(["a", "b", "c"], 2)]).toEqual(["b", "c"]);
  });
  test("window <= 0 → none", () => {
    expect(recentEventIds(["a"], 0).size).toBe(0);
  });
  test("parseStub ignores non-stubs", () => {
    expect(parseStub("plain")).toBeUndefined();
  });
});
