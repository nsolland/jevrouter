/** Advisory value hypotheses, never authoritative customer ROI.
 * Customer-owned criteria determine which hypotheses are relevant.
 */
import type {SpendRecord} from './spend-intelligence.js';
import {createHash} from 'node:crypto';
export type ValueCriterion={id:string;label:string;description?:string;measurementMethod?:string;target?:string;
 measurementType?:'quantitative'|'qualitative';weight:number;enabled:boolean;
 metric:string;
 minimumEvidence:'measured'|'customer_attested'|'hypothesis'};
export type ValueRubric={partnerId:string;customerId:string;revision:number;
 owner:'CUSTOMER';criteria:ValueCriterion[]};
export type ValueSignal={id:string;actorId:string;useCase:string;
 metric:ValueCriterion['metric'];description:string;
 evidence:'measured'|'customer_attested'|'hypothesis';
 sourceId?:string;estimatedBenefitMinor?:number};
const evidenceRank={hypothesis:0,customer_attested:1,measured:2};
const validMetric=(metric:unknown):metric is string=>typeof metric==='string'&&
 /^[a-z][a-z0-9_]{0,63}$/.test(metric);
/** Normalize customer-defined relative priorities without changing raw observations. */
export function normalizeCustomerWeights(criteria:ValueCriterion[]){
 const active=criteria.filter(c=>c.enabled);
 const total=active.reduce((sum,c)=>sum+c.weight,0);
 if(!Number.isFinite(total)||total<0)throw Error('invalid_customer_weight_total');
 return criteria.map(c=>({...c,normalizedWeightPct:c.enabled?
  Math.round((total?c.weight/total:0)*10000)/100:0}));
}
export function evaluateCustomerValue(args:{partnerId:string;customerId:string;
 rubric:ValueRubric;records:SpendRecord[];signals:ValueSignal[]}){
 const {rubric,records,signals,partnerId,customerId}=args;
 if(rubric.partnerId!==partnerId||rubric.customerId!==customerId||rubric.owner!=='CUSTOMER'||
 !Number.isSafeInteger(rubric.revision)||rubric.revision<1||!rubric.criteria.length||
 rubric.criteria.length>50)throw Error('invalid_customer_rubric');
 const criterionIds=new Set<string>();
 for(const c of rubric.criteria){
  if(!c.id||criterionIds.has(c.id)||!c.label||c.label.length>160||
   (c.description!==undefined&&(typeof c.description!=='string'||c.description.length>2000))||
   (c.measurementMethod!==undefined&&(typeof c.measurementMethod!=='string'||c.measurementMethod.length>2000))||
   (c.target!==undefined&&(typeof c.target!=='string'||c.target.length>500))||
   (c.measurementType!==undefined&&!['quantitative','qualitative'].includes(c.measurementType))||
   !validMetric(c.metric)||
   !Number.isFinite(c.weight)||c.weight<0||c.weight>100||
   !(c.minimumEvidence in evidenceRank))throw Error('invalid_value_criterion');
  criterionIds.add(c.id);
 }
 const normalized=normalizeCustomerWeights(rubric.criteria);
 const useCases=new Set<string>(),actors=new Set<string>();
 for(const r of records){
  if(r.tenantId!==customerId)throw Error('tenant_mismatch');
  useCases.add(r.useCase);actors.add(r.actorId);
 }
 const ids=new Set<string>();
 const findings=signals.map(s=>{
  if(!s.id||ids.has(s.id)||!validMetric(s.metric)||!s.description||
   !actors.has(s.actorId)||!useCases.has(s.useCase)||
   !(s.evidence in evidenceRank)||
   (s.estimatedBenefitMinor!==undefined&&
    (!Number.isSafeInteger(s.estimatedBenefitMinor)||s.estimatedBenefitMinor<0)))
   throw Error('invalid_value_signal');
  ids.add(s.id);
  const relevant=rubric.criteria.filter(c=>c.enabled&&c.metric===s.metric);
  const eligible=relevant.filter(c=>evidenceRank[s.evidence]>=evidenceRank[c.minimumEvidence]);
  return {signalId:s.id,actorId:s.actorId,useCase:s.useCase,metric:s.metric,
   description:s.description,evidence:s.evidence,sourceId:s.sourceId??null,
   estimatedBenefitMinor:s.estimatedBenefitMinor??null,
   customerCriteria:relevant.map(c=>c.id),acceptedForReview:eligible.length>0,
   customerWeight:eligible.reduce((n,c)=>n+c.weight,0),
   normalizedCustomerWeightPct:eligible.reduce((n,c)=>n+
    (normalized.find(w=>w.id===c.id)?.normalizedWeightPct??0),0),
   status:eligible.length?'ELIGIBLE_FOR_CUSTOMER_DECISION':'NOT_ELIGIBLE_UNDER_CUSTOMER_CRITERIA'};
 });
 return {schemaVersion:'1.0',partnerId,customerId,rubricRevision:rubric.revision,
  authority:'ADVISORY_ONLY',customerWeights:normalized,findings,
  customerControls:'Customer may change criteria, weights and evidence thresholds; no automatic policy change.',
  limitations:['Hypotheses and estimated benefits are not verified ROI.',
   'A matching customer criterion does not prove causality or business value.',
   'No customer rubric can be inferred from provider spend alone.',
   'Only the customer decides what constitutes value; evaluator matches are not customer acceptance.']};
}
/** Generate explicitly unverified opportunities from observed spend, not claimed savings. */
export function proposeValueHypotheses(records:SpendRecord[],customerId:string):ValueSignal[]{
 const groups=new Map<string,{actorId:string;useCase:string;spend:number}>();
 for(const r of records){
  if(r.tenantId!==customerId)throw Error('tenant_mismatch');
  if(!Number.isSafeInteger(r.amountMinor)||r.amountMinor<0)throw Error('invalid_amount');
  const key=JSON.stringify([r.actorId,r.useCase]);
  const group=groups.get(key)??{actorId:r.actorId,useCase:r.useCase,spend:0};
  if(group.spend>Number.MAX_SAFE_INTEGER-r.amountMinor)throw Error('amount_overflow');
  group.spend+=r.amountMinor;groups.set(key,group);
 }
 return [...groups.entries()].sort((a,b)=>b[1].spend-a[1].spend||a[0].localeCompare(b[0]))
  .map(([key,g])=>({id:'opportunity-'+createHash('sha256').update(key).digest('hex').slice(0,24),actorId:g.actorId,useCase:g.useCase,
   metric:'cost_reduction' as const,evidence:'hypothesis' as const,
   description:'Review whether this workflow can achieve the same customer-defined outcome with lower cost. Observed spend (minor units): '+g.spend+'. No saving is asserted.'}));
}
