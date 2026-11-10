/** Customer-owned deadline and cost policy. Advisory only; does not execute calls. */
export type Urgency = "immediate" | "fast" | "balanced" | "can_wait" | "background";
export interface DeadlinePolicy {
  urgency: Urgency;
  deadlineMs?: number;
  maxCostUsd?: number;
  minQuality: number;
  valuePerMinuteUsd?: number;
}
export interface RouteCandidate {
  id: string;
  expectedDurationMs: number;
  expectedCostUsd: number;
  estimatedQuality: number;
  verified: boolean;
}
export interface DeadlineDecision {
  selected: RouteCandidate | null;
  status: "selected" | "abstain";
  reason: string;
  eligible: string[];
}
const defaults: Record<Urgency, number> = {
  immediate: 5000, fast: 30000, balanced: 120000,
  can_wait: 600000, background: 3600000,
};
export function selectDeadlineRoute(
  policy: DeadlinePolicy, candidates: readonly RouteCandidate[],
): DeadlineDecision {
  const deadline = policy.deadlineMs ?? defaults[policy.urgency];
  const minuteValue = policy.valuePerMinuteUsd ?? 0;
  if (!Object.hasOwn(defaults, policy.urgency) || !Number.isFinite(deadline) || deadline <= 0 ||
      !Number.isFinite(policy.minQuality) || policy.minQuality < 0 || policy.minQuality > 1 ||
      !Number.isFinite(minuteValue) || minuteValue < 0 ||
      (policy.maxCostUsd !== undefined &&
        (!Number.isFinite(policy.maxCostUsd) || policy.maxCostUsd < 0))) {
    throw new RangeError("Invalid customer routing policy");
  }
  const eligible = candidates.filter(c =>
    c.verified &&
    Number.isFinite(c.expectedDurationMs) && c.expectedDurationMs >= 0 &&
    Number.isFinite(c.expectedCostUsd) && c.expectedCostUsd >= 0 &&
    Number.isFinite(c.estimatedQuality) && c.estimatedQuality >= policy.minQuality && c.estimatedQuality <= 1 &&
    c.expectedDurationMs <= deadline &&
    (policy.maxCostUsd === undefined || c.expectedCostUsd <= policy.maxCostUsd));
  eligible.sort((a,b) =>
    (a.expectedCostUsd + a.expectedDurationMs / 60000 * minuteValue) -
    (b.expectedCostUsd + b.expectedDurationMs / 60000 * minuteValue) ||
    a.expectedDurationMs - b.expectedDurationMs || a.id.localeCompare(b.id));
  return {
    selected: eligible[0] ?? null,
    status: eligible.length ? "selected" : "abstain",
    reason: eligible.length ? "Lowest customer-weighted cost within verified quality, deadline and budget constraints" : "No verified candidate meets customer constraints",
    eligible: eligible.map(c => c.id),
  };
}
