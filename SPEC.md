# gaiago specification (v0.1)

gaiago (鳴語, "voiced language") is GAIA's notation for keeping agent context small and structured. It has **three layers**, ordered by how much machinery they need. Layers 1–3 are implemented in this repo and are fully deterministic. Layer 4 is a convention executed by an LLM and is specified here but not implemented.

| § | Layer | Deterministic | Lossless | Code |
|---|-------|:---:|:---:|------|
| 1 | Vocabulary | – | – | this section |
| 2 | Frame (graph rows) | yes | exact for all verbs except `bash` | `src/format.ts` |
| 3 | Diet (decay + stub) | yes | yes (original retrievable by handle) | `src/diet.ts` |
| 4 | Caryll (dictionary codec) | yes | exact round-trip | `src/caryll.ts` |
| 5 | Register (sealed translation) | no (LLM) | by instruction | not implemented here |

## 1. Vocabulary

| Glyph | Meaning |
|-------|---------|
| `真` | status ok |
| `失` | status failed (text begins `ERROR`) |
| `行=N` | N non-blank lines in the original text |
| `詳=k1,k2` | top-level keys of the structured `details` object, or `none` |
| `N→text` | graph row: line number, arrow, trimmed line |
| `∅` | empty payload |
| `·` | field separator in the header |

## 2. Frame

```
frame   = header LF payload
header  = status SP verb SP "·" SP "行=" digits SP "·" SP "詳=" ("none" / key *("," key))
status  = "真" / "失"
verb    = 1*<non-space>
payload = "∅" / bytes
```

### 2.1 Encode

`encode(verb, text, details?)`:

1. `status` = `失` if `text` starts with `ERROR`, else `真`.
2. `行` = count of lines in `text` for which `trim() != ""`.
3. `詳` = `Object.keys(details).join(",")` if `details` is a non-null object with keys, else `none`.
4. `payload`:
   - `verb == "bash"` → drop blank lines, trim each remaining line, prefix with 1-based index and `→`, join with LF.
   - otherwise → `text` unchanged.
   - result empty → `∅`.

### 2.2 Size gate

Framing is applied only when `byteLength(text) > threshold` (default 8192; per-call override; `0` frames everything) and the caller did not request `raw`. Small results pass through untouched, so the notation costs nothing where it cannot help.

### 2.3 Decode

`decode(frame)` parses the header (reject on mismatch), then:

- non-`bash` → payload verbatim → **exact inverse**.
- `bash` → strip `^\d+→` from every row → the *normalised* lines.
- payload `∅` → empty string.

### 2.4 Declared loss

For `bash`, blank lines and leading/trailing whitespace are discarded by the encoder and cannot be recovered. This is intentional: shell output is dominated by padding and alignment whitespace, and numbered rows give the model stable line addresses. Callers that need the exact bytes use the raw bypass.

## 3. Diet

A transcript renderer decays the *viewing* agent's tool activity at **render time**. The canonical event log is never mutated.

```
policy = { preset, keepAllToolCalls, fullTurnWindow, toolTailLines }
```

| Condition | Rendering |
|-----------|-----------|
| `preset == false` | unchanged |
| own call, event within last `fullTurnWindow` events | full |
| own call, `keepAllToolCalls` | full |
| own call, older | first line + `… [collapsed — page the original with tool_result_fetch(sessionId="E", entryId="T")]` |
| another agent's call | last `max(1, toolTailLines)` lines |

Invariant: **no silent omission** — every collapsed view carries the `(sessionId, entryId)` handle needed to retrieve the original. `parseStub` recovers the handle.

## 4. Caryll

Reversible phrase-dictionary codec (`~caryll/1`).

```
~caryll/1
~L ~A1=<phrase>      ; legend, one entry per line
~L ~A2=<phrase>
~~                   ; separator
<body with ~A1, ~A2 … substituted>
```

- Candidates: repeated substrings, 8–120 chars, ≥ 3 occurrences, no newlines.
- A phrase is admitted only if `occurrences × (tokens(phrase) − tokens(alias)) − tokens(legend line) > 0`, measured with the `o200k_base` tokenizer. Unprofitable input yields an empty legend.
- Fenced code, inline code, and URLs are **verbatim islands**; quoted strings are not split.
- Alias prefix `~A`..`~Z` is chosen so that no `~<X><n>` occurs in the input; an alias is never followed by a digit.
- `expand(compress(x)) == x` for every input (exact).

## 5. Register (not implemented here)

In GAIA, long-lived knowledge can be *sealed*: a cheap worker model translates a source into the dense CJK register — kanji operators (`因` because, `故` therefore, `然れど` however), `§` sections, `→` arrows — with zero Latin lexical words, and only that translation enters the caller's context. This layer is a prompt convention, enforced by a post-hoc scan for Latin words; it is non-deterministic and is documented for completeness only.

## 6. Conformance

An implementation conforms if it reproduces §2.1 byte-for-byte, §3's table, and §4's round-trip law. `test/` is the reference suite.
