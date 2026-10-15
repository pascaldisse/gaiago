/**
 * Context diet — render-time decay of a transcript's tool activity.
 *
 * Extracted from gaia-daemon (`boundedActivityPreview`, `recentAgentEventIds`,
 * src/harness/prompt.ts). Never mutates the canonical record: a collapsed call
 * keeps a one-line stub carrying the ids needed to page the original back in.
 * See SPEC.md §3.
 */

export type DietPolicy = {
  /** Master switch. Off → every preview passes through unchanged. */
  preset: boolean;
  /** Never collapse the viewing agent's own tool calls. */
  keepAllToolCalls: boolean;
  /** The viewer's last N events keep their tool calls in full. */
  fullTurnWindow: number;
  /** Another agent's activity is trimmed to its last N lines. */
  toolTailLines: number;
};

export const DEFAULT_POLICY: DietPolicy = { preset: false, keepAllToolCalls: false, fullTurnWindow: 2, toolTailLines: 20 };

export type PreviewContext = {
  /** Tool call authored by the agent the transcript is rendered for. */
  isOwn: boolean;
  /** Event sits inside the policy's recent window. */
  isRecentEvent: boolean;
  eventId: string;
  toolId: string;
};

/** Decay one tool-call preview according to `policy`. */
export function decayPreview(preview: string, policy: DietPolicy, ctx: PreviewContext): string {
  if (!policy.preset) return preview;
  if (ctx.isOwn && (policy.keepAllToolCalls || ctx.isRecentEvent)) return preview;
  if (ctx.isOwn) {
    const firstLine = preview.split("\n", 1)[0]?.trim() ?? "";
    return `${firstLine} … [collapsed — page the original with tool_result_fetch(sessionId="${ctx.eventId}", entryId="${ctx.toolId}")]`;
  }
  return preview
    .split("\n")
    .slice(-Math.max(1, policy.toolTailLines))
    .join("\n");
}

/** Ids of the last `windowSize` event ids (nearest the end) — those count as "recent". */
export function recentEventIds(eventIds: readonly string[], windowSize: number): ReadonlySet<string> {
  if (windowSize <= 0) return new Set();
  return new Set(eventIds.slice(-windowSize));
}

/** Parse the retrieval handle out of a collapsed stub; undefined when `line` is not a stub. */
export function parseStub(line: string): { sessionId: string; entryId: string } | undefined {
  const m = /\[collapsed — page the original with tool_result_fetch\(sessionId="([^"]*)", entryId="([^"]*)"\)\]/.exec(line);
  return m ? { sessionId: m[1]!, entryId: m[2]! } : undefined;
}
