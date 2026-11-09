import {planPrompt,type PromptPlanInput} from './pre-prompt-intelligence.js';
import {recommendModelsForTask,type ModelTaskBenchmark} from './compute-task-fit.js';
import {JevRouter} from './router.js';
import type {CapabilityManifest,RouteResult} from './types.js';

/** Connect prompt planning, measured task fit and Jev's decision-only router. */
export async function routeIntelligentPrompt(args:{
 input:PromptPlanInput; taskClass:string; minimumQuality:number;
 benchmarks:readonly ModelTaskBenchmark[]; router:JevRouter;
 candidates:CapabilityManifest[];
}):Promise<{status:'abstain'|'routed'; reason:string; plan:ReturnType<typeof planPrompt>;
 result?:RouteResult; evidenceIds:string[]}> {
 const plan=planPrompt(args.input);
 const abstain=(reason:string)=>({status:'abstain' as const,reason,plan,evidenceIds:[]});
 if(plan.needsClarification) return abstain('clarification_required');
 if(!plan.routingCandidates.length) return abstain('no_policy_eligible_models');
 if(!args.taskClass.trim()) return abstain('task_class_missing');
 const fit=recommendModelsForTask({taskClass:args.taskClass,minimumQuality:args.minimumQuality},args.benchmarks);
 if(fit.status!=='candidate') return abstain(fit.reason);
 const allowed=new Set(plan.routingCandidates);
 const qualified=fit.candidates.filter(x=>allowed.has(x.modelId));
 if(!qualified.length) return abstain('no_approved_benchmarked_model');
 const byId=new Map(args.candidates.filter(c=>c.type==='model').map(c=>[c.id,c]));
 const candidates=qualified.map(q=>byId.get(q.modelId)).filter((c):c is CapabilityManifest=>!!c);
 if(!candidates.length) return abstain('no_available_manifest');
 const result=await args.router.route({
  request:plan.refinedPrompt,
  actor:args.input.actorId,
  context:{tenantId:args.input.tenantId,taskClass:args.taskClass,
   qualifiedModelIds:qualified.map(x=>x.modelId)}
 },candidates);
 if(result.status==='no_decision' || !result.decision.selected)
  return {status:'abstain',reason:'router_no_decision',plan,result,
   evidenceIds:qualified.map(x=>x.evidenceId)};
 return {status:'routed',reason:'decision_only',plan,result,
  evidenceIds:qualified.map(x=>x.evidenceId)};
}
