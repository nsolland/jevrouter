import { route, type RouteOptions } from "./api.js";
import { normalizeCapability } from "./manifest.js";
import { selectDeadlineRoute, type DeadlinePolicy, type RouteCandidate } from "./deadline-policy.js";
import type { RouteInput, RouteResult } from "./types.js";

/** Enforce the customer's deadline before invoking Jev, then preserve all existing
 * JevRouter permissions, risk, confirmation and provider decision checks.
 * Estimates are caller supplied; no price, speed or quality is fabricated. */
export async function routeWithDeadline(
  input: RouteInput,
  options: RouteOptions & { deadlinePolicy: DeadlinePolicy; measurements: readonly RouteCandidate[] },
): Promise<RouteResult | { status: "abstain"; reason: string; selected: null }> {
  const raw = options.candidates ?? input.candidates;
  if (!raw?.length) return { status: "abstain", reason: "Explicit candidate inventory required", selected: null };
  const candidates = raw.map((c, i) => normalizeCapability(c, `candidates[${i}]`));
  const allowedIds = new Set(candidates.map(c => c.id));
  const measurements = options.measurements.filter(m => allowedIds.has(m.id));
  const ranked = selectDeadlineRoute(options.deadlinePolicy, measurements);
  if (ranked.status === "abstain") return { status: "abstain", reason: ranked.reason, selected: null };
  // Allow all economically eligible candidates through the normal security/decision pipeline.
  // Do not force the cheapest selection over Jev or security policy.
  const eligible = new Set(ranked.eligible);
  return route(input, { ...options, candidates: candidates.filter(c => eligible.has(c.id)) });
}
