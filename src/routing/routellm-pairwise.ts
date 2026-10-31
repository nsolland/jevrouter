/**
 * RouteLLM-compatible pairwise model selection.
 * This is a decision-only strategy: it never invokes models or authorizes execution.
 * Scores must be calibrated on the actual model pair and workload.
 */
export type PairwiseChoice = "strong" | "weak" | "abstain";
export interface PairwiseInput {
  strongModel: string;
  weakModel: string;
  strongWinRate: number | null;
  threshold: number;
  calibrationId: string | null;
  allowedModels: readonly string[];
}
export interface PairwiseResult {
  choice: PairwiseChoice;
  model: string | null;
  reason: string;
  score: number | null;
  threshold: number;
  calibrationId: string | null;
  requiresAuthorization: true;
}
export function routePairwise(input: PairwiseInput): PairwiseResult {
  const base = {
    score: input.strongWinRate,
    threshold: input.threshold,
    calibrationId: input.calibrationId,
    requiresAuthorization: true as const,
  };
  const abstain = (reason: string): PairwiseResult => ({
    ...base, choice: "abstain", model: null, reason,
  });
  if (!input.strongModel || !input.weakModel ||
      input.strongModel === input.weakModel) return abstain("invalid_model_pair");
  if (!input.calibrationId) return abstain("missing_calibration");
  if (!Number.isFinite(input.threshold) || input.threshold < 0 || input.threshold > 1)
    return abstain("invalid_threshold");
  if (input.strongWinRate === null || !Number.isFinite(input.strongWinRate) ||
      input.strongWinRate < 0 || input.strongWinRate > 1)
    return abstain("invalid_score");
  if (!input.allowedModels.includes(input.strongModel) ||
      !input.allowedModels.includes(input.weakModel))
    return abstain("model_not_allowed");
  const choice = input.strongWinRate > input.threshold ? "strong" : "weak";
  return {
    ...base, choice,
    model: choice === "strong" ? input.strongModel : input.weakModel,
    reason: "pairwise_preference_score",
  };
}
