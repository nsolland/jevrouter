/**
 * Intelligence compilation MVP.
 * Heavy offline scenario evaluation becomes a small, inspectable decision table.
 * This is NOT the Jev model, an authorization engine, or a flight controller.
 * An external Jev adapter may rank the compiled candidate set at runtime.
 */
import { createHash } from "node:crypto";

export type Outcome = {
  state: string;
  action: string;
  reward: number;
  safe: boolean;
  scenarioId: string;
  partition: "train" | "holdout";
};
export type Decision = {
  status: "choice" | "no_decision";
  action?: string;
  confidence: number;
  reason: string;
  candidates: { action: string; estimatedReward: number; support: number }[];
};
export type CompiledPolicy = {
  schema: "jev.intelligence-compiler.v1";
  version: string;
  sourceDigest: string;
  minimumSupport: number;
  minimumMargin: number;
  states: Record<string, { action: string; confidence: number; candidates: { action: string; estimatedReward: number; support: number }[] }>;
};

function nonempty(value: string): boolean { return typeof value === "string" && value.trim().length > 0; }
function canonical(rows: Outcome[]): string {
  return JSON.stringify([...rows].sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
export function compileScenarios(rows: Outcome[], options: { minimumSupport?: number; minimumMargin?: number } = {}): CompiledPolicy {
  const minimumSupport = options.minimumSupport ?? 2;
  const minimumMargin = options.minimumMargin ?? 0.05;
  if (!Number.isInteger(minimumSupport) || minimumSupport < 1 || !Number.isFinite(minimumMargin) || minimumMargin < 0) throw new Error("invalid compilation thresholds");
  if (!rows.length) throw new Error("scenario evidence required");
  const seen = new Set<string>();
  const groups = new Map<string, Map<string,{ total:number; count:number }>>();
  for (const row of rows) {
    if (!nonempty(row.scenarioId) || !nonempty(row.state) || !nonempty(row.action) || !Number.isFinite(row.reward) || !["train","holdout"].includes(row.partition) || typeof row.safe !== "boolean") throw new Error("invalid scenario");
    if (seen.has(row.scenarioId)) throw new Error("duplicate scenario id");
    seen.add(row.scenarioId);
    if (row.partition !== "train" || !row.safe) continue;
    const actions = groups.get(row.state) ?? new Map<string,{total:number;count:number}>();
    const agg = actions.get(row.action) ?? {total:0,count:0};
    agg.total += row.reward;
    agg.count += 1;
    actions.set(row.action,agg);
    groups.set(row.state,actions);
  }
  const states: CompiledPolicy["states"] = {};
  for (const [state, actions] of groups) {
    const candidates = [...actions].map(([action,v])=>({action,estimatedReward:v.total/v.count,support:v.count}))
      .filter(v=>v.support>=minimumSupport).sort((a,b)=>b.estimatedReward-a.estimatedReward || a.action.localeCompare(b.action));
    if (!candidates.length) continue;
    const margin = candidates.length===1 ? Infinity : candidates[0].estimatedReward-candidates[1].estimatedReward;
    if (margin < minimumMargin) continue;
    states[state] = { action:candidates[0].action, confidence:candidates.length===1 ? 1 : Math.max(0,Math.min(1,margin/(Math.abs(candidates[0].estimatedReward)+1e-9))), candidates };
  }
  return {schema:"jev.intelligence-compiler.v1",version:"1",sourceDigest:createHash("sha256").update(canonical(rows.filter(r=>r.partition==="train"))).digest("hex"),minimumSupport,minimumMargin,states:Object.fromEntries(Object.entries(states).sort(([a],[b])=>a.localeCompare(b)))};
}
export function decideCompiled(policy: CompiledPolicy, state: string, availableActions: readonly string[]): Decision {
  if (policy.schema !== "jev.intelligence-compiler.v1") throw new Error("unsupported policy schema");
  if (!nonempty(state) || !Array.isArray(availableActions)) throw new Error("invalid state or actions");
  if (new Set(availableActions).size !== availableActions.length || availableActions.some(a=>!nonempty(a))) throw new Error("invalid candidates");
  const found = policy.states[state];
  if (!found) return {status:"no_decision",confidence:0,reason:"unseen_or_unsupported_state",candidates:[]};
  // Never silently switch the trained winner to a lower-ranked action.
  if (!availableActions.includes(found.action)) return {status:"no_decision",confidence:0,reason:"compiled_winner_unavailable",candidates:found.candidates};
  return {status:"choice",action:found.action,confidence:found.confidence,reason:"compiled_candidate_for_jev_review",candidates:found.candidates};
}
export function evaluateHoldout(policy: CompiledPolicy, rows: Outcome[]): {evaluated:number; abstained:number; accuracy:number|null; meanReward:number|null} {
  const holdout = rows.filter(r=>r.partition==="holdout");
  if (!holdout.length) return {evaluated:0,abstained:0,accuracy:null,meanReward:null};
  let evaluated=0,abstained=0,correct=0,reward=0;
  for (const row of holdout) {
    const result = decideCompiled(policy,row.state,[row.action,...(policy.states[row.state]?.candidates.map(x=>x.action).filter(a=>a!==row.action)??[])]);
    if(result.status!=="choice"){abstained++;continue;}
    evaluated++;
    if(result.action===row.action){correct++;reward+=row.reward;}
  }
  return {evaluated,abstained,accuracy:evaluated?correct/evaluated:null,meanReward:evaluated?reward/evaluated:null};
}
