import type { CapabilityManifest } from "./types.js";

export interface ModelQualification {
  status: "qualified" | "unqualified";
  task_classes?: string[];
  measured_utility?: number;
  evidence_source?: string;
  measured_at?: string;
}

function readQualification(candidate: CapabilityManifest): ModelQualification | null {
  const raw = candidate.metadata?.qualification;
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.status !== "qualified" && value.status !== "unqualified") return null;
  return {
    status: value.status,
    ...(Array.isArray(value.task_classes) ? { task_classes: value.task_classes.map(String) } : {}),
    ...(typeof value.measured_utility === "number" ? { measured_utility: value.measured_utility } : {}),
    ...(typeof value.evidence_source === "string" ? { evidence_source: value.evidence_source } : {}),
    ...(typeof value.measured_at === "string" ? { measured_at: value.measured_at } : {}),
  };
}

export function isModelQualified(candidate: CapabilityManifest, taskClass?: string): boolean {
  if (candidate.type !== "model") return true;
  const qualification = readQualification(candidate);
  if (!qualification || qualification.status !== "qualified") return false;
  if (!qualification.evidence_source?.trim()) return false;
  if (qualification.measured_utility !== undefined && !Number.isFinite(qualification.measured_utility)) return false;
  if (!taskClass) return true;
  const taskClasses = qualification.task_classes ?? [];
  return taskClasses.includes(taskClass) || taskClasses.includes("*");
}

/**
 * Build the active routing pool. Model diversity is admitted only when each
 * model has measured qualification evidence for the active task class.
 * Non-model capabilities are unaffected.
 */
export function minimumQualifiedPool(candidates: CapabilityManifest[], taskClass?: string): CapabilityManifest[] {
  return candidates.filter((candidate) => isModelQualified(candidate, taskClass));
}
