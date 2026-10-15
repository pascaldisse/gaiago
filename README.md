# gaiago 鳴語

Deterministic notation for keeping an agent's context small, structured, and recoverable. Extracted from [GAIA](https://github.com/pascaldisse), a multi-agent room daemon where every tool result and transcript line costs tokens.

```
真 bash · 行=40 · 詳=none
1→PASS  test/suite-00.test.ts   (12 ms)
2→PASS  test/suite-01.test.ts   (15 ms)
…
```

## Why

Long-running agents drown in their own history: a 500-line log read ten turns ago still rides along in every prompt. gaiago attacks that with three small, boring, **deterministic** mechanisms — no model call, no heuristics that vary between runs — and one rule: *never lose anything silently*.

| Layer | What it does | Loss |
|-------|--------------|------|
| **Frame** (`src/format.ts`) | Header + numbered graph rows for large tool output; size-gated, `raw` bypass | Exact, except `bash` whitespace (documented) |
| **Diet** (`src/diet.ts`) | Old own tool calls collapse to a one-line stub holding a retrieval handle; other agents' activity is tail-trimmed | None — original is paged back by handle |
| **Caryll** (`src/caryll.ts`) | Token-profit-gated phrase dictionary; code/URLs stay verbatim | None — exact round-trip |

The notation itself (`真/失`, `行=`, `詳=`, `N→`, `∅`) is specified in [SPEC.md](SPEC.md). A fourth layer — sealed translation into a dense kanji register by an LLM — is described there but is a prompt convention, not code.

## Before / after

Measured by `bun run examples/demo.ts` (output in [`examples/demo.out.txt`](examples/demo.out.txt)):

| Layer | Input | Bytes before → after | Notes |
|-------|-------|----------------------|-------|
| Frame | 40-line padded `bash` output | 1889 → 1751 (−7.3%) | padding stripped, rows addressable; modest by design |
| Diet | one old `read` of a 500-line log | 4525 → 118 (−97.4%) | stub + `tool_result_fetch` handle |
| Caryll | 60 near-identical log lines | 5939 → 900 B, 1679 → 766 tokens | 2 legend entries, `expand(compress(x)) === x` |

Framing is intentionally the weakest layer: it makes results *regular*, not small. The savings come from diet (stop re-sending what the model has already seen) and Caryll (dedupe what repeats).

```
read({"path":"big.log"}) … [collapsed — page the original with tool_result_fetch(sessionId="ev42", entryId="tc7")]
```

## Use

```ts
import { formatIfLarge, decodeGaiago, decayPreview, compressCaryll, expandCaryll } from "./src/index.ts";

// 1. Frame large tool output (≤ 8 KiB passes through untouched)
const wire = formatIfLarge("bash", stdout, details, { thresholdBytes: 8192 });
decodeGaiago(wire);                       // exact for every verb but bash (normalised)

// 2. Decay old tool calls when rendering a transcript
decayPreview(preview, policy, { isOwn: true, isRecentEvent: false, eventId, toolId });

// 3. Lossless dictionary codec
const { output, stats } = compressCaryll(text);
expandCaryll(output) === text;            // always
```

```sh
bun install && bun test && bun run examples/demo.ts
```

## How GAIA uses it

- Every `gaia` tool result above `GAIA_TOOL_FORMAT_BYTES` (default 8192) is framed; `raw: true` or a per-call `compress_above_bytes` overrides it.
- Context diet (`/diet`, per-room or workspace policy) applies `decayPreview` while rendering the room transcript for each agent turn; the canonical room event keeps the full tool detail, and `tool_result_fetch` pages it back (≤ 32 KB per call).
- Caryll backs the `caryll compress|expand|stats` tool for memory and knowledge files.
- Sealed translation (SPEC §5) keeps source-language text out of a caller's context entirely.

## Scope and honesty

- The frame layer is a ~20-line pure function in the daemon; here it gains a decoder, a threshold gate, and tests. It does not claim to be a compressor.
- GAIA's earlier finding: lexical dictionaries gave 0% on model *reasoning* output, so gaiago deliberately does not apply Caryll to it.
- Not included: the daemon, room/session store, tokenizer-aware budgeting beyond Caryll, and the LLM register translator.

## Layout

```
src/format.ts   frame encode/decode, size gate
src/diet.ts     render-time decay + stub handle
src/caryll.ts   reversible dictionary codec
test/           bun test suites
examples/       demo.ts + captured output
SPEC.md         notation + conformance rules
```

MIT © Pascal Disse
