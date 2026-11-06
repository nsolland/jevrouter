import { createHash } from "node:crypto";

/** Local-only harness experiment. Never issues execution permits. */
export interface GuardedDecision {
  goal: string;
  taskClass: string;
  policyDigest: string;
  inputDigest: string;
  outputDigest: string;
  output: string;
  authorityRequired: boolean;
}

export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function reuseDecision(
  previous: GuardedDecision,
  current: Pick<GuardedDecision, "goal" | "taskClass" | "policyDigest" | "inputDigest">,
): { status: "REUSE" | "RECOMPUTE"; output?: string } {
  if (previous.authorityRequired || classifyCanary(previous.output) === "BLOCKED_CANARY" ||
      previous.goal !== current.goal ||
      previous.taskClass !== current.taskClass ||
      previous.policyDigest !== current.policyDigest ||
      previous.inputDigest !== current.inputDigest ||
      digest(previous.output) !== previous.outputDigest) {
    return { status: "RECOMPUTE" };
  }
  return { status: "REUSE", output: previous.output };
}

/** Test-only interception: suspicious model output is not executable authority. */
export function classifyCanary(output: string): "BLOCKED_CANARY" | "REVIEW_REQUIRED" {
  return /VALO_CANARY_EXECUTE_[A-Z0-9_]+/.test(output) ? "BLOCKED_CANARY" : "REVIEW_REQUIRED";
}
