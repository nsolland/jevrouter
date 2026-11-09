/** Signal -> decision -> evaluation contract inspired by programmable routers and eval matrices.
 * Independent of gateway. No model call or external action is performed here.
 */
export type RouteSignal={name:string;value:string|number|boolean;source:string};
export type CandidateResult={model:string;costMinor:number;latencyMs:number;
 qualityScore:number;accepted:boolean;testCaseId:string};
export type RouteConstraint={allowedModels:string[];maxCostMinor:number;
 minQualityScore:number;maxLatencyMs:number};
export type EvaluatedCandidate={model:string;sampleCount:number;acceptanceRate:number;
 meanCostMinor:number;meanLatencyMs:number;meanQuality:number;eligible:boolean;reasons:string[]};
export function evaluateRouteCandidates(
 signals:readonly RouteSignal[],results:readonly CandidateResult[],constraint:RouteConstraint
):{signals:readonly RouteSignal[];ranked:EvaluatedCandidate[];selectedModel:string|null;limitations:string[]}{
 if(!Number.isSafeInteger(constraint.maxCostMinor)||constraint.maxCostMinor<0||
 !Number.isFinite(constraint.minQualityScore)||constraint.minQualityScore<0||
 constraint.minQualityScore>1||!Number.isFinite(constraint.maxLatencyMs)||constraint.maxLatencyMs<0)
 throw Error('invalid_route_constraint');
 const ranked=[...new Set(constraint.allowedModels)].map(model=>{
  const rows=results.filter(r=>r.model===model);
  if(rows.some(r=>!r.testCaseId||!Number.isSafeInteger(r.costMinor)||r.costMinor<0||
   !Number.isFinite(r.latencyMs)||r.latencyMs<0||!Number.isFinite(r.qualityScore)||
   r.qualityScore<0||r.qualityScore>1))throw Error('invalid_evaluation');
  const n=rows.length;
  const mean=(f:(r:CandidateResult)=>number)=>n?rows.reduce((s,r)=>s+f(r),0)/n:0;
  const acceptanceRate=mean(r=>r.accepted?1:0),meanCostMinor=mean(r=>r.costMinor);
  const meanLatencyMs=mean(r=>r.latencyMs),meanQuality=mean(r=>r.qualityScore);
  const reasons=[...(!n?['missing_evaluation']:[]),
   ...(n&&meanCostMinor>constraint.maxCostMinor?['cost_limit']:[]),
   ...(n&&meanLatencyMs>constraint.maxLatencyMs?['latency_limit']:[]),
   ...(n&&meanQuality<constraint.minQualityScore?['quality_limit']:[])];
  return {model,sampleCount:n,acceptanceRate,meanCostMinor,meanLatencyMs,
   meanQuality,eligible:reasons.length===0,reasons};
 }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||
 b.acceptanceRate-a.acceptanceRate||b.meanQuality-a.meanQuality||
 a.meanCostMinor-b.meanCostMinor||a.model.localeCompare(b.model));
 return {signals,ranked,selectedModel:ranked.find(x=>x.eligible)?.model??null,
  limitations:['Offline evaluation only; matched tasks and confidence intervals required for production claims.',
  'Route selection is advisory and does not grant execution authority.']};
}
