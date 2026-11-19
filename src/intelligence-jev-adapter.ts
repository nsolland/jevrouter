/**
 * Adapter boundary: compiled offline intelligence supplies candidates;
 * actual Jev decision probabilities come from an injected Jev provider.
 * The adapter never authorizes or executes any action.
 */
import type { CompiledPolicy } from "./intelligence-compilation.js";
export type JevChoiceRequest = {
  state: string;
  candidates: { action: string; estimatedReward: number; support: number }[];
  sourceDigest: string;
};
export type JevChoiceResponse = {
  status: "choice" | "no_decision";
  action?: string;
  probabilities: Record<string, number>;
  confidence: number;
};
export type JevProvider = (request: JevChoiceRequest) => Promise<JevChoiceResponse>;
export async function requestCompiledJevChoice(
  policy: CompiledPolicy,
  state: string,
  availableActions: readonly string[],
  jev: JevProvider
): Promise<JevChoiceResponse> {
  const abstain = (): JevChoiceResponse => ({status:"no_decision",probabilities:{},confidence:0});
  if (policy.schema!=="jev.intelligence-compiler.v1" || !state || new Set(availableActions).size!==availableActions.length) return abstain();
  const compiled = policy.states[state];
  if (!compiled || !availableActions.includes(compiled.action)) return abstain();
  const candidates = compiled.candidates.filter(c=>availableActions.includes(c.action));
  if(!candidates.length) return abstain();
  const response = await jev({state,candidates,sourceDigest:policy.sourceDigest});
  if (response.status==="no_decision") return abstain();
  if (response.status!=="choice" || !response.action || !candidates.some(c=>c.action===response.action) ||
      !Number.isFinite(response.confidence) || response.confidence<0 || response.confidence>1 ||
      !response.probabilities || typeof response.probabilities!=="object") return abstain();
  const keys=Object.keys(response.probabilities);
  if(keys.length!==candidates.length || keys.some(k=>!candidates.some(c=>c.action===k)))return abstain();
  const probs=Object.values(response.probabilities);
  if(probs.some(p=>!Number.isFinite(p)||p<0||p>1)||Math.abs(probs.reduce((a,b)=>a+b,0)-1)>0.001)return abstain();
  return {...response,probabilities:{...response.probabilities}};
}

/**
 * Sequential planner supplies bounded offline candidates, while a real external
 * Jev provider makes the final typed decision. No authorization or execution.
 */
import { createHash } from "node:crypto";
import { candidatesForJev, type SequentialPlan } from "./sequential-intelligence.js";
export async function requestSequentialJevChoice(
  plan: SequentialPlan,
  state: string,
  availableActions: readonly string[],
  jev: JevProvider
): Promise<JevChoiceResponse> {
  const abstain = (): JevChoiceResponse => ({status:"no_decision",probabilities:{},confidence:0});
  const candidates = candidatesForJev(plan,state,availableActions);
  if (!candidates.length) return abstain();
  const sourceDigest = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
  const request: JevChoiceRequest = {
    state, sourceDigest,
    candidates: candidates.map(c=>({action:c.action,estimatedReward:c.value,support:c.branches}))
  };
  const response=await jev(request);
  if(response.status==="no_decision")return abstain();
  if(response.status!=="choice"||!response.action||!candidates.some(c=>c.action===response.action)||
     !Number.isFinite(response.confidence)||response.confidence<0||response.confidence>1||
     !response.probabilities||typeof response.probabilities!=="object"||Array.isArray(response.probabilities))return abstain();
  const keys=Object.keys(response.probabilities);
  if(keys.length!==candidates.length||keys.some(k=>!candidates.some(c=>c.action===k)))return abstain();
  const probs=Object.values(response.probabilities);
  if(probs.some(p=>!Number.isFinite(p)||p<0||p>1)||Math.abs(probs.reduce((a,b)=>a+b,0)-1)>0.001)return abstain();
  return {status:"choice",action:response.action,confidence:response.confidence,probabilities:{...response.probabilities}};
}
