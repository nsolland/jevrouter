/** Offline retrospective AI model value analysis. Never calls a model or changes access.
 * Evidence of a cheaper model is matched by task class, difficulty and capabilities.
 * Costs are observations, not invoices unless independently verified at source.
 */
import {createHash} from 'node:crypto';
export type CostOrigin='invoice_verified'|'metered_estimate'|'unknown';
export type Difficulty='simple'|'moderate'|'complex';
export type CallObservation={
 tenantId:string;callId:string;actorId:string|null;taskId:string|null;
 taskClass:string|null;difficulty:Difficulty|null;modelId:string;
 costMicros:number|null;currency:string;costOrigin:CostOrigin;
 occurredAt:string;outcome:'ACCEPTED'|'REJECTED'|'UNKNOWN';
 outcomeIndependentlyVerified:boolean;capabilities:string[];evidenceRef:string;
};
export type AlternativeEvidence={
 tenantId:string;modelId:string;taskClass:string;difficulty:Difficulty;
 capabilities:string[];sampleCount:number;verifiedAcceptedCount:number;
 qualityLowerBound:number;meanCostMicros:number;currency:string;
 independentlyVerified:boolean;evidenceRef:string;
};
export type ValueAnalysisPolicy={minEvidenceSamples:number;minAcceptedRate:number;
 minimumQualityLowerBound:number;maxEvidenceAgeDays?:number};
const modelId=(s:unknown)=>typeof s==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:/@-]{0,191}$/.test(s);
const id=(s:unknown)=>typeof s==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(s);
const n=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const int=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
const digest=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function checkedPolicy(p:ValueAnalysisPolicy){
 if(!int(p.minEvidenceSamples)||p.minEvidenceSamples<1||
 !n(p.minAcceptedRate)||p.minAcceptedRate>1||
 !n(p.minimumQualityLowerBound)||p.minimumQualityLowerBound>1)throw Error('INVALID_ANALYSIS_POLICY');
}
export function analyzeRetrospectiveModelValue({
 tenantId,period,currency,calls,alternatives,policy
}:{
 tenantId:string;period:string;currency:string;calls:readonly CallObservation[];
 alternatives:readonly AlternativeEvidence[];policy:ValueAnalysisPolicy;
}){
 if(!id(tenantId)||!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(period)||!/^[A-Z]{3}$/.test(currency)||
 !Array.isArray(calls)||!Array.isArray(alternatives)||!policy)throw Error('INVALID_ANALYSIS_INPUT');
 checkedPolicy(policy);
 const seen=new Set<string>(),actorRows=new Map<string,{actorId:string;calls:number;observedMicros:number;unknownCostCalls:number;verifiedAccepted:number;unverifiedOutcomes:number;potentialSavingsMicros:number;reviewCandidateCalls:number;}>();
 const byModel=new Map<string,{modelId:string;calls:number;observedMicros:number;unknownCostCalls:number;verifiedAccepted:number;reviewCandidateCalls:number;potentialSavingsMicros:number;}>();
 const modelTaskUsage=new Map<string,{modelId:string;taskClass:string;difficulty:string;calls:number;observedMicros:number;reviewCandidateCalls:number}>();
 const opportunities: Array<{callId:string;taskClass:string;difficulty:Difficulty;currentModel:string;alternativeModel:string;observedMicros:number;alternativeMeanMicros:number;potentialSavingsMicros:number;alternativeEvidenceRef:string;status:'REVIEW_ONLY'}>=[];
 let unattributedCalls=0,unpricedCalls=0,comparableCalls=0,verifiedOutcomes=0,observedCostMicros=0;
 for(const a of alternatives){
  if(a.tenantId!==tenantId||!modelId(a.modelId)||!id(a.taskClass)||!['simple','moderate','complex'].includes(a.difficulty)||
   !Array.isArray(a.capabilities)||!a.capabilities.every(id)||!int(a.sampleCount)||!int(a.verifiedAcceptedCount)||
   a.verifiedAcceptedCount>a.sampleCount||!n(a.qualityLowerBound)||a.qualityLowerBound>1||
   !n(a.meanCostMicros)||a.currency!==currency||typeof a.independentlyVerified!=='boolean'||!id(a.evidenceRef))
    throw Error('INVALID_ALTERNATIVE_EVIDENCE');
 }
 for(const c of calls){
  if(c.tenantId!==tenantId||!id(c.callId)||seen.has(c.callId)||!modelId(c.modelId)||
   !(c.actorId===null||id(c.actorId))||!(c.taskId===null||id(c.taskId))||
   !(c.taskClass===null||id(c.taskClass))||!(c.difficulty===null||['simple','moderate','complex'].includes(c.difficulty))||
   !['invoice_verified','metered_estimate','unknown'].includes(c.costOrigin)||
   (c.costMicros!==null&&!int(c.costMicros))||c.currency!==currency||
   !/^\d{4}-\d\d-\d\dT/.test(c.occurredAt)||!Number.isFinite(Date.parse(c.occurredAt))||
   c.occurredAt.slice(0,7)!==period||
   !['ACCEPTED','REJECTED','UNKNOWN'].includes(c.outcome)||
   typeof c.outcomeIndependentlyVerified!=='boolean'||
   !Array.isArray(c.capabilities)||!c.capabilities.every(id)||!id(c.evidenceRef))
    throw Error('INVALID_CALL_OBSERVATION');
  if(c.costOrigin==='unknown'&&c.costMicros!==null)throw Error('UNSOURCED_COST');
  seen.add(c.callId);
  const actor=c.actorId??'UNATTRIBUTED';
  if(!c.actorId||!c.taskId)unattributedCalls++;
  if(c.costMicros===null)unpricedCalls++;
  else observedCostMicros+=c.costMicros;
  const accepted=c.outcome==='ACCEPTED'&&c.outcomeIndependentlyVerified;
  if(accepted)verifiedOutcomes++;
  const ar=actorRows.get(actor)??{actorId:actor,calls:0,observedMicros:0,unknownCostCalls:0,verifiedAccepted:0,unverifiedOutcomes:0,potentialSavingsMicros:0,reviewCandidateCalls:0};
  const mr=byModel.get(c.modelId)??{modelId:c.modelId,calls:0,observedMicros:0,unknownCostCalls:0,verifiedAccepted:0,reviewCandidateCalls:0,potentialSavingsMicros:0};
  ar.calls++;mr.calls++;
  const taskKey=JSON.stringify([c.modelId,c.taskClass??"UNCLASSIFIED",c.difficulty??"UNKNOWN"]);
  const grouped=modelTaskUsage.get(taskKey)??{modelId:c.modelId,taskClass:c.taskClass??"UNCLASSIFIED",difficulty:c.difficulty??"UNKNOWN",calls:0,observedMicros:0,reviewCandidateCalls:0};
  grouped.calls++;
  if(c.costMicros!==null)grouped.observedMicros+=c.costMicros;
  modelTaskUsage.set(taskKey,grouped);
  if(c.costMicros===null){ar.unknownCostCalls++;mr.unknownCostCalls++;}
  else{ar.observedMicros+=c.costMicros;mr.observedMicros+=c.costMicros;}
  if(accepted){ar.verifiedAccepted++;mr.verifiedAccepted++;}
  if(!c.outcomeIndependentlyVerified)ar.unverifiedOutcomes++;
  if(c.taskId&&c.taskClass&&c.difficulty&&c.costMicros!==null&&accepted){
   const candidateSet=alternatives.filter(a=>a.modelId!==c.modelId&&a.taskClass===c.taskClass&&
    a.difficulty===c.difficulty&&a.independentlyVerified===true&&
    a.sampleCount>=policy.minEvidenceSamples&&
    a.verifiedAcceptedCount/a.sampleCount>=policy.minAcceptedRate&&
    a.qualityLowerBound>=policy.minimumQualityLowerBound&&
    c.capabilities.every((cap:string)=>a.capabilities.includes(cap))&&
    a.meanCostMicros<c.costMicros);
   if(candidateSet.length){
    comparableCalls++;
    candidateSet.sort((a,b)=>a.meanCostMicros-b.meanCostMicros||a.modelId.localeCompare(b.modelId));
    const best=candidateSet[0];const savings=Math.max(0,c.costMicros-best.meanCostMicros);
    ar.reviewCandidateCalls++;mr.reviewCandidateCalls++;grouped.reviewCandidateCalls++;
    ar.potentialSavingsMicros+=savings;mr.potentialSavingsMicros+=savings;
    opportunities.push({callId:c.callId,taskClass:c.taskClass,difficulty:c.difficulty,currentModel:c.modelId,
      alternativeModel:best.modelId,observedMicros:c.costMicros,alternativeMeanMicros:best.meanCostMicros,
      potentialSavingsMicros:savings,alternativeEvidenceRef:best.evidenceRef,status:'REVIEW_ONLY'});
   }
  }
  actorRows.set(actor,ar);byModel.set(c.modelId,mr);
 }
 const actors=[...actorRows.values()].sort((a,b)=>b.observedMicros-a.observedMicros||a.actorId.localeCompare(b.actorId))
  .map(a=>({...a,costPerVerifiedAcceptedMicros:a.unknownCostCalls===0&&a.verifiedAccepted>0?a.observedMicros/a.verifiedAccepted:null,
   recommendation:a.reviewCandidateCalls>0?'REVIEW_MODEL_CHOICE':'COLLECT_COMPARABLE_EVIDENCE'}));
 const models=[...byModel.values()].sort((a,b)=>b.observedMicros-a.observedMicros||a.modelId.localeCompare(b.modelId));
 const totalPotentialSavingsMicros=opportunities.reduce((n,x)=>n+x.potentialSavingsMicros,0);
 const report={schema:'jevrouter.retrospective-model-value.v1' as const,tenantId,period,currency,
   observedCostMicros,totalCalls:calls.length,verifiedOutcomes,unpricedCalls,unattributedCalls,
   comparableCalls,reviewCandidateCalls:opportunities.length,totalPotentialSavingsMicros,
   actors,models,modelTaskUsage:[...modelTaskUsage.values()].sort((a,b)=>b.observedMicros-a.observedMicros||a.modelId.localeCompare(b.modelId)),opportunities,policy,
   costKind:'MIXED_OBSERVED_NOT_RECONCILED' as const,moneyUnit:'millionth_of_currency_unit' as const,
   inference:'CONDITIONAL_COUNTERFACTUAL_NOT_REALIZED_SAVINGS' as const,
   evidenceOrigin:'USER_SUPPLIED_INDEPENDENT_CLAIMS_NOT_VERIFIED_BY_THIS_FUNCTION' as const,
   automaticAccessChange:false,executionAuthorized:false,providerCalls:0};
 return {...report,reportDigest:digest(report)};
}
