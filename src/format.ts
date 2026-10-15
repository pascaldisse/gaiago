/**
 * gaiago framing — deterministic graph notation for tool results.
 *
 * Extracted from GAIA's gaia-daemon (`formatGaiagoResult`, src/harness/tools-pi.ts),
 * generalised into a pure function plus its decoder. See SPEC.md §2.
 *
 *   <status> <verb> · 行=<n> · 詳=<detail-keys>\n<payload>
 *
 * status  真 (ok) | 失 (text begins with "ERROR")
 * 行      count of non-blank lines in the ORIGINAL text
 * 詳      comma-joined top-level keys of the structured `details` object, or "none"
 * payload `bash` → numbered graph rows `<i>→<trimmed line>` (blank lines dropped)
 *         anything else → original text, byte-for-byte
 *         empty → ∅
 */

export type GaiagoFrame = {
  status: "真" | "失";
  verb: string;
  /** non-blank line count of the original text */
  lines: number;
  /** top-level keys of `details`, or [] when none */
  detailKeys: string[];
  /** payload as encoded (graph rows for bash) */
  payload: string;
};

export type FormatOptions = {
  /** Results at or below this many UTF-8 bytes are returned untouched. Default 8192. */
  thresholdBytes?: number;
  /** Bypass formatting entirely. */
  raw?: boolean;
};

export const DEFAULT_THRESHOLD_BYTES = 8_192;

const NUMBERED_ROW = /^(\d+)→(.*)$/;

/** Encode `text` as a gaiago frame. Always frames; see {@link formatIfLarge} for thresholding. */
export function encodeGaiago(verb: string, text: string, details?: unknown): string {
  const lines = text.split("\n");
  const nonblank = lines.filter((line) => line.trim()).length;
  const status = text.startsWith("ERROR") ? "失" : "真";
  const detailKind =
    details && typeof details === "object" ? Object.keys(details as object).join(",") || "none" : "none";
  const payload =
    verb === "bash"
      ? lines
          .filter((line) => line.trim())
          .map((line, i) => `${i + 1}→${line.trim()}`)
          .join("\n")
      : text;
  return `${status} ${verb} · 行=${nonblank} · 詳=${detailKind}\n${payload || "∅"}`;
}

/** Apply the size gate: small or `raw` results pass through, large ones are framed. */
export function formatIfLarge(verb: string, text: string, details?: unknown, options: FormatOptions = {}): string {
  if (options.raw) return text;
  const threshold = options.thresholdBytes ?? DEFAULT_THRESHOLD_BYTES;
  if (new TextEncoder().encode(text).length <= threshold) return text;
  return encodeGaiago(verb, text, details);
}

/** Parse a gaiago frame header + payload. Throws on anything that is not a frame. */
export function parseGaiago(frame: string): GaiagoFrame {
  const nl = frame.indexOf("\n");
  if (nl === -1) throw new Error("gaiago: missing payload separator");
  const header = frame.slice(0, nl);
  const match = /^(真|失) (\S+) · 行=(\d+) · 詳=(.*)$/.exec(header);
  if (!match) throw new Error(`gaiago: malformed header: ${header}`);
  const [, status, verb, lines, detail] = match;
  return {
    status: status as "真" | "失",
    verb: verb!,
    lines: Number(lines),
    detailKeys: detail === "none" ? [] : detail!.split(","),
    payload: frame.slice(nl + 1),
  };
}

/**
 * Decode a frame back to text.
 *
 * Exact (byte-for-byte) for every verb except `bash`. For `bash` the encoder
 * drops blank lines and trims each line, so decoding returns the NORMALISED
 * lines — a deliberate, documented loss (SPEC.md §2.4). Use `tool_result_fetch`-style
 * retrieval of the original when exact bash output matters.
 */
export function decodeGaiago(frame: string): string {
  const parsed = parseGaiago(frame);
  if (parsed.payload === "∅") return "";
  if (parsed.verb !== "bash") return parsed.payload;
  return parsed.payload
    .split("\n")
    .map((row) => {
      const m = NUMBERED_ROW.exec(row);
      if (!m) throw new Error(`gaiago: malformed graph row: ${row}`);
      return m[2]!;
    })
    .join("\n");
}

/** True when `text` is a well-formed gaiago frame. */
export function isGaiago(text: string): boolean {
  try {
    parseGaiago(text);
    return true;
  } catch {
    return false;
  }
}

/** Bytes saved (negative = frame is larger) by framing `text`. */
export function savings(verb: string, text: string, details?: unknown): { before: number; after: number; saved: number } {
  const enc = new TextEncoder();
  const before = enc.encode(text).length;
  const after = enc.encode(encodeGaiago(verb, text, details)).length;
  return { before, after, saved: before - after };
}
