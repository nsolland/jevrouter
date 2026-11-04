import { recommendModelsForTask, type ComputeTaskRequirement, type ModelTaskBenchmark } from "./compute-task-fit.js";

export interface TaskFitEvaluationCase {
  id: string;
  task: ComputeTaskRequirement;
  /** Outcome measurements on the same frozen task, including failed attempts. */
  outcomes: { modelId: string; accepted: boolean; costUsd: number; energyJoules: number }[];
}

export interface TaskFitArmResult {
  completed: number;
  totalCostUsd: number;
  totalEnergyJoules: number;
  costPerAcceptedUsd: number | null;
  joulesPerAccepted: number | null;
}

/** Offline paired replay; the chosen model MUST have an observed outcome for each case. */
export function evaluateTaskFitVsFixedModel(cases: readonly TaskFitEvaluationCase[], benchmarks: readonly ModelTaskBenchmark[], fixedModelId: string) {
  if (!cases.length || !fixedModelId.trim() || new Set(cases.map(c => c.id)).size !== cases.length || cases.some(c => !c.id.trim())) {
    throw new Error("non-empty unique cases and fixed model are required");
  }
  const fixed = { completed: 0, totalCostUsd: 0, totalEnergyJoules: 0 };
  const routed = { completed: 0, totalCostUsd: 0, totalEnergyJoules: 0 };
  let abstentions = 0;
  for (const item of cases) {
    const choice = recommendModelsForTask(item.task, benchmarks);
    if (choice.status !== "candidate") { abstentions++; continue; }
    const chosenId = choice.candidates[0]!.modelId;
    for (const [arm, modelId] of [[fixed, fixedModelId], [routed, chosenId]] as const) {
      const found = item.outcomes.filter(o => o.modelId === modelId);
      if (found.length !== 1) throw new Error(`missing or duplicate paired outcome: ${item.id}/${modelId}`);
      const observation = found[0]!;
      if (![observation.costUsd, observation.energyJoules].every(v => Number.isFinite(v) && v >= 0)) {
        throw new Error(`invalid measured cost or energy: ${item.id}/${modelId}`);
      }
      arm.completed += Number(observation.accepted);
      arm.totalCostUsd += observation.costUsd;
      arm.totalEnergyJoules += observation.energyJoules;
    }
  }
  const finish = (arm: typeof fixed): TaskFitArmResult => ({
    ...arm,
    costPerAcceptedUsd: arm.completed ? arm.totalCostUsd / arm.completed : null,
    joulesPerAccepted: arm.completed ? arm.totalEnergyJoules / arm.completed : null,
  });
  return { kind: "paired_offline_replay" as const, evaluatedCases: cases.length - abstentions,
    abstentions, fixed: finish(fixed), taskFit: finish(routed), executionAuthority: false };
}
