/** Opt-in Gemini Hydrogen execution-model descriptor; not a Jev decision provider. */
export const GEMINI_HYDROGEN = Object.freeze({
  modelId: "gemini-4-hydrogen",
  provider: "google",
  role: "execution_model",
  deploymentMode: "api" as const,
  authority: "analysis_only" as const,
  benchmarkStatus: "unverified" as const,
});

/**
 * Convert independently measured Hydrogen outcomes into the existing task-fit
 * contract. Never substitute vendor claims or token list prices for observed
 * fully-loaded costs. The caller supplies region and task-specific evidence.
 */
import type { ModelTaskBenchmark } from "./compute-task-fit.js";

export function hydrogenTaskBenchmark(
  measured: Omit<ModelTaskBenchmark, "modelId" | "deploymentMode">,
): ModelTaskBenchmark {
  if (!measured.evidenceId?.trim() || !measured.taskClass?.trim() ||
      !measured.region?.trim() || !Number.isInteger(measured.sampleSize) ||
      measured.sampleSize < 1 || !Number.isFinite(measured.acceptedRate) ||
      measured.acceptedRate < 0 || measured.acceptedRate > 1 ||
      !Number.isFinite(measured.costUsdPerAttempt) ||
      measured.costUsdPerAttempt < 0 || !Number.isFinite(measured.p95LatencyMs) ||
      measured.p95LatencyMs < 0) {
    throw new Error("invalid_hydrogen_measurement");
  }
  return { ...measured, modelId: GEMINI_HYDROGEN.modelId, deploymentMode: "api" };
}
