/** @deprecated Compatibility export only. KISS, goal contracts and escalation are owned by AI Bridge (nsolland/ai-bridge). Do not add new orchestration here. */
/** KISS preflight: choose the least capable sufficient execution shape.
 * This routine only recommends a route. It never calls models or executes effects.
 * Unknown or conflicting evidence escalates; a cheap route is never inferred from
 * prompt length alone.
 */
export type KissMode = "deterministic" | "direct" | "bounded" | "agent" | "abstain";

export interface KissInput {
  request: string;
  /** Explicitly provided trusted, exact deterministic answer. No inference. */
  deterministicAnswer?: string;
  /** Explicit contract from caller that a stateless single reply is sufficient. */
  statelessSingleAnswer?: boolean;
  /** A verified, approved direct provider is available. */
  directAvailable?: boolean;
  /** External tools are required for successful completion. */
  requiresTools?: boolean;
  /** Write operations, side effects or external actions are required. */
  requiresAction?: boolean;
  /** Prior conversation / memory / retrieval is required. */
  requiresContext?: boolean;
  /** True when the task requires multi-step reasoning or orchestration. */
  requiresPlanning?: boolean;
  /** Narrow, pre-approved tool names for a bounded agent. */
  boundedToolsets?: readonly string[];
  /** Explicitly authorized ceiling for model calls (not a token budget). */
  maxModelCalls?: number;
  /** No model spending is permitted if zero. */
  maxCostMinor?: number;
}

export interface KissDecision {
  mode: KissMode;
  reason: string;
  /** This is a routing recommendation, never execution authorization. */
  executionAuthorized: false;
  maxModelCalls: number;
  maxToolIterations: number;
  /** Only populated with explicitly supplied deterministic content. */
  deterministicAnswer?: string;
}

function decision(mode: KissMode, reason: string, calls: number, iterations = 0, answer?: string): KissDecision {
  return {
    mode, reason, executionAuthorized: false,
    maxModelCalls: calls, maxToolIterations: iterations,
    ...(answer !== undefined ? { deterministicAnswer: answer } : {}),
  };
}

export function selectKissExecution(input: KissInput): KissDecision {
  if (!input || typeof input.request !== "string" || !input.request.trim()) {
    throw new Error("KISS_INVALID_REQUEST");
  }
  if (input.maxCostMinor !== undefined && (!Number.isSafeInteger(input.maxCostMinor) || input.maxCostMinor < 0)) {
    throw new Error("KISS_INVALID_BUDGET");
  }
  if (input.maxModelCalls !== undefined && (!Number.isSafeInteger(input.maxModelCalls) || input.maxModelCalls < 0)) {
    throw new Error("KISS_INVALID_CALL_LIMIT");
  }
  const effects = input.requiresAction === true;
  const tools = input.requiresTools === true;
  const context = input.requiresContext === true;
  const planning = input.requiresPlanning === true;
  const complex = effects || tools || context || planning;
  // An explicit deterministic result cannot bypass a requested effect or missing context.
  if (!complex && input.deterministicAnswer !== undefined) {
    if (typeof input.deterministicAnswer !== "string") throw new Error("KISS_INVALID_ANSWER");
    return decision("deterministic", "trusted_deterministic_answer", 0, 0, input.deterministicAnswer);
  }
  if (input.maxCostMinor === 0 || input.maxModelCalls === 0) {
    return decision("abstain", "model_budget_exhausted", 0);
  }
  if (!complex && input.statelessSingleAnswer === true && input.directAvailable === true) {
    return decision("direct", "explicit_stateless_single_answer", 1);
  }
  const toolsets = input.boundedToolsets;
  if (tools && !effects && !context && !planning && Array.isArray(toolsets)
      && toolsets.length > 0 && toolsets.length <= 3
      && toolsets.every(name => typeof name === "string" && !!name.trim()
        && name !== "all" && name !== "*")
      && new Set(toolsets).size === toolsets.length
      && (input.maxModelCalls === undefined || input.maxModelCalls >= 2)) {
    return decision("bounded", "verified_narrow_tools", 2, 2);
  }
  return decision("agent", complex ? "requires_full_capability" : "insufficient_evidence_for_shortcut",
    input.maxModelCalls ?? 0);
}
