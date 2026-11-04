/** Evidence-based task-to-model placement advice. Never authorizes or executes work. */
export interface ComputeTaskRequirement {
  taskClass: string;
  minimumQuality: number;
  maximumLatencyMs?: number;
  allowedRegions?: string[];
  allowedDeploymentModes?: ("local" | "edge" | "private_cloud" | "api")[];
}

export interface ModelTaskBenchmark {
  modelId: string;
  taskClass: string;
  region: string;
  deploymentMode: "local" | "edge" | "private_cloud" | "api";
  /** Independently measured acceptance rate on comparable labelled tasks, [0,1]. */
  acceptedRate: number;
  /** Fully loaded cost including inference, hardware, operations and review. */
  costUsdPerAttempt: number;
  p95LatencyMs: number;
  sampleSize: number;
  evidenceId: string;
}

export interface ModelTaskFitCandidate {
  modelId: string;
  region: string;
  deploymentMode: ModelTaskBenchmark["deploymentMode"];
  expectedCostUsdPerAcceptedTask: number;
  acceptedRate: number;
  p95LatencyMs: number;
  evidenceId: string;
}

export interface ModelTaskFitResult {
  status: "candidate" | "abstain";
  reason: string;
  taskClass: string;
  candidates: ModelTaskFitCandidate[];
  authority: "analysis_only";
}

/** Rank only comparable, independently measured task outcomes; missing evidence fails closed. */
export function recommendModelsForTask(
  task: ComputeTaskRequirement,
  benchmarks: readonly ModelTaskBenchmark[],
  minimumSamples = 30,
): ModelTaskFitResult {
  const abstain = (reason: string): ModelTaskFitResult => ({
    status: "abstain", reason, taskClass: task.taskClass, candidates: [], authority: "analysis_only",
  });
  if (!task.taskClass.trim() || !Number.isFinite(task.minimumQuality) || task.minimumQuality <= 0 || task.minimumQuality > 1 ||
      !Number.isInteger(minimumSamples) || minimumSamples < 1 ||
      (task.maximumLatencyMs !== undefined && (!Number.isFinite(task.maximumLatencyMs) || task.maximumLatencyMs <= 0))) {
    return abstain("invalid_task_requirements");
  }
  const candidates = benchmarks.filter(b =>
    b.taskClass === task.taskClass && b.modelId.trim() && b.evidenceId.trim() &&
    Number.isInteger(b.sampleSize) && b.sampleSize >= minimumSamples &&
    Number.isFinite(b.acceptedRate) && b.acceptedRate >= task.minimumQuality && b.acceptedRate <= 1 &&
    Number.isFinite(b.costUsdPerAttempt) && b.costUsdPerAttempt >= 0 &&
    Number.isFinite(b.p95LatencyMs) && b.p95LatencyMs >= 0 &&
    (task.maximumLatencyMs === undefined || b.p95LatencyMs <= task.maximumLatencyMs) &&
    (task.allowedRegions === undefined || task.allowedRegions.includes(b.region)) &&
    (task.allowedDeploymentModes === undefined || task.allowedDeploymentModes.includes(b.deploymentMode))
  ).map(b => ({
    modelId: b.modelId, region: b.region, deploymentMode: b.deploymentMode,
    expectedCostUsdPerAcceptedTask: b.costUsdPerAttempt / b.acceptedRate,
    acceptedRate: b.acceptedRate, p95LatencyMs: b.p95LatencyMs, evidenceId: b.evidenceId,
  })).sort((a, b) => a.expectedCostUsdPerAcceptedTask - b.expectedCostUsdPerAcceptedTask ||
    b.acceptedRate - a.acceptedRate || a.modelId.localeCompare(b.modelId));
  return candidates.length ? {
    status: "candidate", reason: "ranked_by_measured_task_fit", taskClass: task.taskClass,
    candidates, authority: "analysis_only",
  } : abstain("no_qualified_benchmark");
}
