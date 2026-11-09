/** Deterministic pre-prompt planning; no external model calls or execution. */
export type PromptPlanInput = {
 tenantId:string; actorId:string; originalPrompt:string; purpose:string;
 dataClass:'public'|'internal'|'confidential'|'restricted';
 maxCostMinor:number; requiresAction:boolean; approvedModels:string[];
};
export type PromptPlan = {
 tenantId:string; originalPrompt:string; refinedPrompt:string;
 intent:'analysis'|'generation'|'code'|'action'|'unknown';
 complexity:'low'|'medium'|'high'; routingCandidates:string[];
 needsClarification:boolean; reasons:string[]; executionAuthorized:false;
};
const rules=[
 {intent:'code' as const,re:/\b(code|coding|debug|programmer|kode|feilsøk|implementer|build)\b/i},
 {intent:'analysis' as const,re:/\b(analy[sz]e|analyse|compare|sammenlign|evaluate|vurder)\b/i},
 {intent:'action' as const,re:/\b(send|email|deploy|delete|pay|transfer|send ut|slett|betal)\b/i},
 {intent:'generation' as const,re:/\b(write|draft|summarize|skriv|oppsummer|utkast)\b/i}
];
export function planPrompt(input:PromptPlanInput):PromptPlan {
 if(!input.tenantId || !input.actorId || !input.purpose ||
    !Number.isSafeInteger(input.maxCostMinor) || input.maxCostMinor<0 ||
    !Array.isArray(input.approvedModels) || input.approvedModels.some(x=>!x))
   throw new Error('invalid_prompt_context');
 const prompt=input.originalPrompt.trim();
 if(!prompt || prompt.length>100000) throw new Error('invalid_prompt');
 const matched=rules.filter(r=>r.re.test(prompt));
 const intent=matched.length===1?matched[0].intent:'unknown';
 const needsClarification=intent==='unknown' || input.requiresAction || matched.length>1;
 const complexity=prompt.length>1000?'high':prompt.length>200?'medium':'low';
 const reasons:string[]=[];
 if(intent==='unknown') reasons.push('intent_uncertain');
 if(matched.length>1) reasons.push('multiple_intents');
 if(input.requiresAction) reasons.push('external_action_requires_separate_authorization');
 if(input.dataClass==='restricted') reasons.push('restricted_data_requires_approved_environment');
 if(!input.approvedModels.length) reasons.push('no_approved_models');
 if(input.maxCostMinor===0) reasons.push('zero_budget');
 // Routing candidates remain subject to policy, availability and measured quality.
 const routingCandidates=input.dataClass==='restricted' || input.maxCostMinor===0
  ? [] : [...new Set(input.approvedModels)];
 return {tenantId:input.tenantId,originalPrompt:input.originalPrompt,
  refinedPrompt:`Task objective: ${input.purpose}\nOriginal user request (preserve intent):\n${prompt}\nReturn an answer consistent with the request. Do not perform external actions without authorization.`,
  intent,complexity,routingCandidates,needsClarification,reasons,executionAuthorized:false};
}
