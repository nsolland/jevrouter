import { createHash } from "node:crypto";
import { selectKissExecution, type KissInput, type KissMode, type KissDecision } from "./kiss.js";

/** Compact, immutable goal contract passed unchanged across escalation steps.
 * Only trusted caller context is accepted; this builder does not fabricate facts.
 */
export interface GoalContractInput {
  goal: string;
  essentials?: readonly string[];
  constraints?: readonly string[];
  successCriteria: readonly string[];
  evidenceIds?: readonly string[];
  budget?: { maxCostMinor?: number; maxModelCalls?: number };
}
export interface GoalContract {
  readonly id: string;
  readonly goal: string;
  readonly essentials: readonly string[];
  readonly constraints: readonly string[];
  readonly successCriteria: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly budget: Readonly<{ maxCostMinor?: number; maxModelCalls?: number }>;
  readonly executionAuthorized: false;
}

function normalized(items: readonly string[] | undefined, name: string): string[] {
  if (items === undefined) return [];
  if (!Array.isArray(items) || items.some(x => typeof x !== "string" || !x.trim())) {
    throw new Error(`GOAL_INVALID_${name}`);
  }
  return [...new Set(items.map(x => x.trim()))];
}
export function createGoalContract(input: GoalContractInput): GoalContract {
  if (!input || typeof input.goal !== "string" || !input.goal.trim()) throw new Error("GOAL_INVALID_OBJECTIVE");
  const goal = input.goal.trim();
  const essentials = normalized(input.essentials, "ESSENTIALS");
  const constraints = normalized(input.constraints, "CONSTRAINTS");
  const successCriteria = normalized(input.successCriteria, "CRITERIA");
  const evidenceIds = normalized(input.evidenceIds, "EVIDENCE");
  if (!successCriteria.length) throw new Error("GOAL_MISSING_SUCCESS_CRITERIA");
  const budget = { ...input.budget };
  for (const value of [budget.maxCostMinor, budget.maxModelCalls]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new Error("GOAL_INVALID_BUDGET");
  }
  const canonical = JSON.stringify({ goal, essentials, constraints, successCriteria, evidenceIds, budget });
  return Object.freeze({
    id: createHash("sha256").update(canonical).digest("hex"),
    goal, essentials: Object.freeze(essentials), constraints: Object.freeze(constraints),
    successCriteria: Object.freeze(successCriteria), evidenceIds: Object.freeze(evidenceIds),
    budget: Object.freeze(budget), executionAuthorized: false as const,
  });
}

export type EscalationMode = KissMode | "specialist" | "deep";
export const ESCALATION_ORDER = ["deterministic", "direct", "bounded", "agent", "specialist", "deep"] as const;
export interface ProgressEvidence {
  contractId: string;
  previousMode: EscalationMode;
  outcome: "completed" | "incomplete" | "blocked";
  /** Caller-verified, not an LLM's self-assertion. */
  successVerified: boolean;
  /** Caller-verified evidence that the present level cannot complete the goal. */
  capacityInsufficient: boolean;
  /** Stronger modes must be explicitly approved, never merely suggested by model text. */
  approvedModes: readonly EscalationMode[];
  /** Remaining allowable additional model calls. */
  remainingModelCalls: number;
}
export interface EscalationDecision {
  status: "complete" | "continue" | "escalate" | "blocked";
  mode: EscalationMode | null;
  reason: string;
  contractId: string;
  executionAuthorized: false;
}

export function initialGoalRoute(contract: GoalContract, evidence: Omit<KissInput,"request">): KissDecision {
  // Goals and budgets are bound by caller contract. Per-request hints cannot relax them.
  const modelCap = contract.budget.maxModelCalls;
  const requestedCap = evidence.maxModelCalls;
  const maxModelCalls = modelCap === undefined ? requestedCap :
    requestedCap === undefined ? modelCap : Math.min(modelCap, requestedCap);
  const moneyCap = contract.budget.maxCostMinor;
  const requestedMoney = evidence.maxCostMinor;
  const maxCostMinor = moneyCap === undefined ? requestedMoney :
    requestedMoney === undefined ? moneyCap : Math.min(moneyCap, requestedMoney);
  return selectKissExecution({
    ...evidence, request: contract.goal, maxModelCalls, maxCostMinor,
  });
}

export function decideGoalEscalation(contract: GoalContract, evidence: ProgressEvidence): EscalationDecision {
  if (evidence.contractId !== contract.id) throw new Error("GOAL_CONTRACT_MISMATCH");
  if (!ESCALATION_ORDER.includes(evidence.previousMode as typeof ESCALATION_ORDER[number])) throw new Error("GOAL_INVALID_MODE");
  if (!Number.isSafeInteger(evidence.remainingModelCalls) || evidence.remainingModelCalls < 0) throw new Error("GOAL_INVALID_REMAINING_BUDGET");
  if (!Array.isArray(evidence.approvedModes)) throw new Error("GOAL_INVALID_APPROVALS");
  const base = { contractId: contract.id, executionAuthorized: false as const };
  if (evidence.outcome === "completed" && evidence.successVerified) {
    return { ...base, status: "complete", mode: null, reason: "success_independently_verified" };
  }
  if (evidence.outcome === "blocked") {
    return { ...base, status: "blocked", mode: null, reason: "documented_blocker" };
  }
  if (evidence.outcome !== "incomplete" && evidence.outcome !== "completed") throw new Error("GOAL_INVALID_OUTCOME");
  if (!evidence.capacityInsufficient) {
    return { ...base, status: "continue", mode: evidence.previousMode, reason: "no_verified_need_to_escalate" };
  }
  if (evidence.remainingModelCalls === 0 || contract.budget.maxCostMinor === 0) {
    return { ...base, status: "blocked", mode: null, reason: "budget_exhausted" };
  }
  const current = ESCALATION_ORDER.indexOf(evidence.previousMode as typeof ESCALATION_ORDER[number]);
  // Never jump over levels simply because a more expensive mode is available.
  const next = ESCALATION_ORDER[current + 1];
  if (!next) return { ...base, status: "blocked", mode: null, reason: "no_higher_mode" };
  if (!evidence.approvedModes.includes(next)) {
    return { ...base, status: "blocked", mode: null, reason: "next_mode_not_approved" };
  }
  return { ...base, status: "escalate", mode: next, reason: "verified_capacity_gap" };
}
