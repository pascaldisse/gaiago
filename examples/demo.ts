// bun run examples/demo.ts — before/after byte counts for each gaiago layer.
import { compressCaryll, decayPreview, decodeGaiago, encodeGaiago, expandCaryll, savings } from "../src/index.ts";

const bytes = (s: string) => new TextEncoder().encode(s).length;

// 1. Framing: a padded `bash` result (e.g. `ls -l` / test runner output).
const bash = Array.from({ length: 40 }, (_, i) => `    PASS  test/suite-${String(i).padStart(2, "0")}.test.ts   (${i * 3 + 12} ms)    \n`).join("\n");
const s = savings("bash", bash);
console.log(`① framing  bash result: ${s.before} B → ${s.after} B  (saved ${s.saved} B, ${((s.saved / s.before) * 100).toFixed(1)}%)`);
console.log(encodeGaiago("bash", bash).split("\n").slice(0, 4).join("\n"), "\n  …");
console.log(`  decode(encode(x)) rows: ${decodeGaiago(encodeGaiago("bash", bash)).split("\n").length} (normalised)\n`);

// 2. Diet: an old own tool call collapses to a stub; the original stays retrievable.
const preview = `read({"path":"big.log"})\n${"log line\n".repeat(500)}`;
const stub = decayPreview(preview, { preset: true, keepAllToolCalls: false, fullTurnWindow: 2, toolTailLines: 20 }, { isOwn: true, isRecentEvent: false, eventId: "ev42", toolId: "tc7" });
console.log(`② diet     old own tool call: ${bytes(preview)} B → ${bytes(stub)} B\n  ${stub}\n`);

// 3. Caryll: lossless dictionary codec on repetitive text.
const log = Array.from({ length: 60 }, (_, i) => `[2026-10-15T12:${String(i).padStart(2, "0")}:00Z] worker pool: connection established to upstream gateway, retrying handshake`).join("\n");
const c = compressCaryll(log);
console.log(`③ caryll   repetitive log: ${bytes(log)} B → ${bytes(c.output)} B, ${c.stats.tokensBefore} → ${c.stats.tokensAfter} tokens (${c.stats.legendEntries} legend entries)`);
console.log(`  exact round-trip: ${expandCaryll(c.output) === log}`);
