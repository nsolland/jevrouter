import type { CapabilityManifest } from "./types.js";

export interface ModelQualification {
  status: "qualified" | "unqualified";
  task_classes?: string[];
  measured_utility?: number;
  evidence_source?: string;
  measured_at?: string;
  /** Coding harness used when this qualification was measured. */
  harness?: string;
  /** Repository or repository class represented by the benchmark. */
  repository?: string;
  /** Measured end-to-end task quality for this model+harness configuration. */
  quality?: number;
  /** Measured execution cost for this model+harness configuration. */
  cost?: number;
  /** Measured execution latency for this model+harness configuration. */
  latency_ms?: number;
  /** Compute profile used for the measured run. */
  compute?: string;
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
    ...(typeof value.harness === "string" ? { harness: value.harness } : {}),
    ...(typeof value.repository === "string" ? { repository: value.repository } : {}),
    ...(typeof value.quality === "number" ? { quality: value.quality } : {}),
    ...(typeof value.cost === "number" ? { cost: value.cost } : {}),
    ...(typeof value.latency_ms === "number" ? { latency_ms: value.latency_ms } : {}),
    ...(typeof value.compute === "string" ? { compute: value.compute } : {}),
  };
}

function finiteIfPresent(value: number | undefined): boolean {
  return value === undefined || Number.isFinite(value);
}

export function isModelQualified(candidate: CapabilityManifest, taskClass?: string): boolean {
  if (candidate.type !== "model") return true;
  const qualification = readQualification(candidate);
  if (!qualification || qualification.status !== "qualified") return false;
  if (!qualification.evidence_source?.trim()) return false;
  if (!finiteIfPresent(qualification.measured_utility)) return false;
  if (!finiteIfPresent(qualification.quality)) return false;
  if (!finiteIfPresent(qualification.cost)) return false;
  if (!finiteIfPresent(qualification.latency_ms)) return false;
  if (!taskClass) return true;
  const taskClasses = qualification.task_classes ?? [];
  return taskClasses.includes(taskClass) || taskClasses.includes("*");
}

/**
 * Build the active routing pool. Model diversity is admitted only when each
 * model has measured qualification evidence for the active task class.
 *
 * Qualification may bind the evidence to a model+harness+repository+compute
 * configuration. Jev receives that evidence as candidate state and chooses
 * among the admitted configurations. Qualification evidence does not grant
 * execution authority; consequential effects remain subject to the external
 * Heimel/REHT consequence-time authority gate.
 */
export function minimumQualifiedPool(candidates: CapabilityManifest[], taskClass?: string): CapabilityManifest[] {
  return candidates.filter((candidate) => isModelQualified(candidate, taskClass));
}
