/** Is Your AI Spend Worth It? A deterministic, tenant-scoped top-consumer scan.
 * Token concentration is descriptive; observed value is not causal ROI.
 */
import type {SpendRecord} from './spend-intelligence.js';
export type ValueEvidence={actorId:string;useCase:string;observedBenefitMinor:number;
 baselineMinor:number;verified:boolean;sourceId:string};
export type TopSpendScanInput={partnerId:string;tenantId:string;currency:string;
 periodStart:string;periodEnd:string;records:SpendRecord[];valueEvidence?:ValueEvidence[]};
export type TopConsumer={rank:number;actorId:string;spendMinor:number;sharePct:number;
 useCases:string[];valueStatus:'NOT_ESTABLISHED'|'OBSERVED_NOT_CAUSAL';
 observedIncrementalBenefitMinor?:number;observedNetMinor?:number};
const validAmount=(n:number)=>Number.isSafeInteger(n)&&n>=0;
const date=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export function scanTopAiSpend(input:TopSpendScanInput){
 if(!input.partnerId||!input.tenantId||!input.currency||!date(input.periodStart)||
  !date(input.periodEnd)||input.periodStart>input.periodEnd||!Array.isArray(input.records))
  throw Error('invalid_scan');
 const seen=new Set<string>();
 const actors=new Map<string,{spendMinor:number;useCases:Set<string>}>();
 let totalMinor=0;
 for(const record of input.records){
  if(record.tenantId!==input.tenantId)throw Error('tenant_mismatch');
  if(record.currency!==input.currency)throw Error('currency_mismatch');
  if(!record.id||seen.has(record.id))throw Error('duplicate_record');
  seen.add(record.id);
  if(!validAmount(record.amountMinor)||!date(record.occurredAt.slice(0,10))||
   record.occurredAt.slice(0,10)<input.periodStart||
   record.occurredAt.slice(0,10)>input.periodEnd)throw Error('invalid_spend_record');
  if(!record.actorId.trim())throw Error('missing_actor_attribution');
  if(totalMinor>Number.MAX_SAFE_INTEGER-record.amountMinor)throw Error('amount_overflow');
  totalMinor+=record.amountMinor;
  const actor=actors.get(record.actorId)??{spendMinor:0,useCases:new Set<string>()};
  actor.spendMinor+=record.amountMinor;
  actor.useCases.add(record.useCase);actors.set(record.actorId,actor);
 }
 const sorted=[...actors.entries()].sort((a,b)=>b[1].spendMinor-a[1].spendMinor||
  a[0].localeCompare(b[0]));
 const topCount=sorted.length?Math.max(1,Math.ceil(sorted.length*0.1)):0;
 const evidence=input.valueEvidence??[];
 const evidenceIds=new Set<string>();
 for(const item of evidence){
  if(!item.sourceId||evidenceIds.has(item.sourceId)||!actors.has(item.actorId)||
   !validAmount(item.observedBenefitMinor)||!validAmount(item.baselineMinor)||
   !item.useCase||!actors.get(item.actorId)!.useCases.has(item.useCase))
   throw Error('invalid_value_evidence');
  evidenceIds.add(item.sourceId);
 }
 const top:TopConsumer[]=sorted.slice(0,topCount).map(([actorId,actor],i)=>{
  const matching=evidence.filter(e=>e.actorId===actorId&&e.verified);
  const observed=matching.length?matching.reduce((sum,e)=>
   sum+e.observedBenefitMinor-e.baselineMinor,0):undefined;
  return {rank:i+1,actorId,spendMinor:actor.spendMinor,
   sharePct:totalMinor?Math.round(actor.spendMinor/totalMinor*10000)/100:0,
   useCases:[...actor.useCases].sort(),
   valueStatus:observed===undefined?'NOT_ESTABLISHED':'OBSERVED_NOT_CAUSAL',
   ...(observed===undefined?{}:{observedIncrementalBenefitMinor:observed,
    observedNetMinor:observed-actor.spendMinor})};
 });
 const topSpendMinor=top.reduce((sum,a)=>sum+a.spendMinor,0);
 return {schemaVersion:'1.0',product:'Is Your AI Spend Worth It?',partnerId:input.partnerId,
  tenantId:input.tenantId,currency:input.currency,
  period:{start:input.periodStart,end:input.periodEnd},population:{
   observedActors:sorted.length,topCount,topSharePct:totalMinor?
    Math.round(topSpendMinor/totalMinor*10000)/100:0,
   coverage:'observed_attributed_actors_only' as const},
  spend:{totalMinor,topSpendMinor,otherSpendMinor:totalMinor-topSpendMinor},
  topConsumers:top,roiStatus:'NOT_CAUSALLY_ESTABLISHED' as const,
  recommendedNextStep:top.length?'validate_workflow_outcomes_and_baselines':'collect_attributed_usage',
  limitations:['Top 10% refers to observed actors, not all licensed users.',
   'Spend alone does not measure tokens or realized value.',
   'Observed benefit is not causal ROI; verify baselines and attribution.',
   'Recommendations do not grant access or change organization policy.']};
}
