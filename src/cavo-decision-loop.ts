/** Customer-authoritative CAVO decision and benefit follow-up.
 * Monetary amounts are minor units; observed outcomes never imply causal ROI.
 */
import {createHash,randomBytes} from 'node:crypto';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
export type EvidenceLevel='HYPOTHESIS'|'CUSTOMER_ATTESTED'|'MEASURED';
export type Outcome={criterionId:string;baseline:number|string;target:number|string;
 actual?:number|string;unit:string;evidence:EvidenceLevel;sourceId?:string};
export type AllocationRule={id:string;version:number;method:'DIRECT'|'USAGE'|'PROPORTIONAL';
 shares:Record<string,number>};
export type CostEvent={id:string;amountMinor:number;currency:string;actorId:string;
 workflowId:string;attempt:'SUCCESS'|'FAILED'|'RETRY';ruleId:string;ruleVersion:number};
export type Initiative={id:string;customerId:string;rubricRevision:number;
 title:string;outcomes:Outcome[]};
export type Recommendation={id:string;initiativeId:string;description:string;
 forecastBenefitMinor?:number;forecastCostMinor?:number;assumptions:string[]};
export type CustomerDecision={id:string;recommendationId:string;choice:'PROCEED'|'REJECT'|'DEFER';
 rationale:string;customerActor:string;at:string};
export type FollowUp={id:string;decisionId:string;implemented:boolean;at:string;
 actualCostMinor:number;realizedBenefitMinor?:number;outcomes:Outcome[];
 evidence:EvidenceLevel;sourceIds:string[]};
type Event={seq:number;kind:'INITIATIVE'|'ALLOCATION_RULE'|'COST'|'RECOMMENDATION'|'DECISION'|'FOLLOW_UP';
 payload:Initiative|AllocationRule|CostEvent|Recommendation|CustomerDecision|FollowUp;
 previousHash:string;hash:string};
const validAmount=(n:number)=>Number.isSafeInteger(n)&&n>=0;
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export class CavoDecisionLoop{
 private events:Event[]=[];
 static restore(customerId:string,events:Event[]):CavoDecisionLoop{
  const loop=new CavoDecisionLoop(customerId);
  if(!Array.isArray(events))throw Error('invalid_cavo_snapshot');
  for(const event of events){
   if(!event||event.seq!==loop.events.length+1||event.previousHash!==(loop.events.at(-1)?.hash??'GENESIS'))
    throw Error('invalid_cavo_snapshot');
   const {hash:expected,...data}=event;
   if(hash(data)!==expected)throw Error('invalid_cavo_snapshot');
   const v=event.payload;
   switch(event.kind){
    case 'INITIATIVE':loop.addInitiative(v as Initiative);break;
    case 'ALLOCATION_RULE':loop.addAllocationRule(v as AllocationRule);break;
    case 'COST':loop.addCost(v as CostEvent);break;
    case 'RECOMMENDATION':loop.recommend(v as Recommendation);break;
    case 'DECISION':loop.customerDecision(v as CustomerDecision);break;
    case 'FOLLOW_UP':loop.followUp(v as FollowUp);break;
    default:throw Error('invalid_cavo_snapshot');
   }
   if(loop.events.at(-1)?.hash!==expected)throw Error('invalid_cavo_snapshot');
  }
  return loop;
 }
 private ids=new Set<string>();
 private initiatives=new Map<string,Initiative>();
 private rules=new Map<string,AllocationRule>();
 private recommendations=new Map<string,Recommendation>();
 private decisions=new Map<string,CustomerDecision>();
 private followUps=new Map<string,FollowUp>();
 constructor(readonly customerId:string){}
 private append(kind:Event['kind'],payload:Event['payload'],id:string){
  if(!id||this.ids.has(kind+':'+id))throw Error('duplicate_event');
  const seq=this.events.length+1,previousHash=this.events.at(-1)?.hash??'GENESIS';
  const event={seq,kind,payload:structuredClone(payload),previousHash};
  const full={...event,hash:hash(event)};this.events.push(full);this.ids.add(kind+':'+id);
 }
 addInitiative(v:Initiative){
  if(v.customerId!==this.customerId||!v.id||!v.title||
   !Number.isSafeInteger(v.rubricRevision)||v.rubricRevision<1||
   !v.outcomes.every(o=>o.criterionId&&o.unit&&o.evidence))
   throw Error('invalid_initiative');
  this.append('INITIATIVE',v,v.id);this.initiatives.set(v.id,structuredClone(v));
 }
 addAllocationRule(v:AllocationRule){
  if(!v.id||!Number.isSafeInteger(v.version)||v.version<1||
   !['DIRECT','USAGE','PROPORTIONAL'].includes(v.method)||
   !Object.values(v.shares).every(n=>Number.isFinite(n)&&n>=0)||
   Math.abs(Object.values(v.shares).reduce((a,b)=>a+b,0)-1)>1e-8)
   throw Error('invalid_allocation_rule');
  const key=v.id+':'+v.version;
  this.append('ALLOCATION_RULE',v,key);this.rules.set(key,structuredClone(v));
 }
 addCost(v:CostEvent){
  if(!v.id||!validAmount(v.amountMinor)||!/^[A-Z]{3}$/.test(v.currency)||
   !v.actorId||!v.workflowId||!['SUCCESS','FAILED','RETRY'].includes(v.attempt)||
   !this.rules.has(v.ruleId+':'+v.ruleVersion))throw Error('invalid_cost_event');
  this.append('COST',v,v.id);
 }
 recommend(v:Recommendation){
  if(!v.id||!this.initiatives.has(v.initiativeId)||!v.description||
   (v.forecastBenefitMinor!==undefined&&!validAmount(v.forecastBenefitMinor))||
   (v.forecastCostMinor!==undefined&&!validAmount(v.forecastCostMinor))||
   !Array.isArray(v.assumptions))throw Error('invalid_recommendation');
  this.append('RECOMMENDATION',v,v.id);this.recommendations.set(v.id,structuredClone(v));
 }
 customerDecision(v:CustomerDecision){
  if(!v.id||!this.recommendations.has(v.recommendationId)||
   !['PROCEED','REJECT','DEFER'].includes(v.choice)||!v.rationale.trim()||
   !v.customerActor||!Number.isFinite(Date.parse(v.at)))throw Error('invalid_customer_decision');
  this.append('DECISION',v,v.id);this.decisions.set(v.id,structuredClone(v));
 }
 followUp(v:FollowUp){
  const decision=this.decisions.get(v.decisionId);
  if(!v.id||!decision||decision.choice!=='PROCEED'||typeof v.implemented!=='boolean'||
   !validAmount(v.actualCostMinor)||!Number.isFinite(Date.parse(v.at))||
   (v.realizedBenefitMinor!==undefined&&!validAmount(v.realizedBenefitMinor))||
   !Array.isArray(v.sourceIds)||!Array.isArray(v.outcomes)||
   !['HYPOTHESIS','CUSTOMER_ATTESTED','MEASURED'].includes(v.evidence)||
   (v.realizedBenefitMinor!==undefined&&(v.evidence==='HYPOTHESIS'||!v.sourceIds.length))||
   (!v.implemented&&v.realizedBenefitMinor!==undefined))throw Error('invalid_follow_up');
  this.append('FOLLOW_UP',v,v.id);this.followUps.set(v.id,structuredClone(v));
 }
 allocate(currency:string){
  const amounts=new Map<string,number>();
  for(const event of this.events.filter(e=>e.kind==='COST')){
   const cost=event.payload as CostEvent;if(cost.currency!==currency)continue;
   const rule=this.rules.get(cost.ruleId+':'+cost.ruleVersion)!;
   for(const [unit,share] of Object.entries(rule.shares)){
    amounts.set(unit,(amounts.get(unit)??0)+cost.amountMinor*share);
   }
  }
  return {currency,byUnit:Object.fromEntries(amounts),includesFailedAndRetries:true,
   ruleVersions:[...new Set(this.events.filter(e=>e.kind==='COST').map(e=>{
    const c=e.payload as CostEvent;return c.ruleId+':'+c.ruleVersion;}))]};
 }
 assessment(decisionId:string){
  const decision=this.decisions.get(decisionId);if(!decision)throw Error('decision_not_found');
  const recommendation=this.recommendations.get(decision.recommendationId)!;
  const followUps=[...this.followUps.values()].filter(f=>f.decisionId===decisionId);
  return {customerId:this.customerId,initiative:this.initiatives.get(recommendation.initiativeId),
   recommendation,customerDecision:decision,followUps,
   forecastBenefitMinor:recommendation.forecastBenefitMinor??null,
   observedCustomerReportedBenefitMinor:followUps.reduce((sum,f)=>sum+(f.realizedBenefitMinor??0),0),
   benefitDocumentation:followUps.some(f=>f.realizedBenefitMinor!==undefined)?
    'CUSTOMER_REPORTED_NOT_CAUSALLY_VERIFIED':'NOT_DOCUMENTED',
   forecastVarianceMinor:recommendation.forecastBenefitMinor===undefined||
    !followUps.some(f=>f.realizedBenefitMinor!==undefined)?null:
    followUps.reduce((sum,f)=>sum+(f.realizedBenefitMinor??0),0)-recommendation.forecastBenefitMinor,
   causalRoi:'NOT_ESTABLISHED'};
 }
 audit(){
  let previousHash='GENESIS';
  for(const e of this.events){
   const {hash:actual,...data}=e;
   if(e.previousHash!==previousHash||hash(data)!==actual)return {valid:false,count:this.events.length};
   previousHash=actual;
  }
  return {valid:true,count:this.events.length,headHash:previousHash,
   events:structuredClone(this.events)};
 }
}

/** Atomic single-process snapshot persistence. No distributed lock or external notarization. */
export class CavoDecisionFileStore{
 private static locks=new Map<string,Promise<void>>();
 constructor(private readonly file:string){}
 async load(customerId:string):Promise<CavoDecisionLoop>{
  try{
   const data=JSON.parse(await readFile(this.file,'utf8')) as {customerId:string;events:Event[]};
   if(data.customerId!==customerId)throw Error('cavo_customer_scope_denied');
   return CavoDecisionLoop.restore(customerId,data.events);
  }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return new CavoDecisionLoop(customerId);throw e;}
 }
 async transact<T>(customerId:string,fn:(loop:CavoDecisionLoop)=>T):Promise<T>{
  const prior=CavoDecisionFileStore.locks.get(this.file)??Promise.resolve();
  let release!:()=>void;const gate=new Promise<void>(r=>release=r);
  const next=prior.then(()=>gate);CavoDecisionFileStore.locks.set(this.file,next);
  await prior;
  try{
   const loop=await this.load(customerId),result=fn(loop);
   const events=loop.audit();if(!events.valid)throw Error('invalid_cavo_audit');
   await mkdir(dirname(this.file),{recursive:true,mode:0o700});
   const temp=this.file+'.'+randomBytes(12).toString('hex')+'.tmp';
   await writeFile(temp,JSON.stringify({customerId,events:events.events}),{flag:'wx',mode:0o600});
   await rename(temp,this.file);return result;
  }finally{release();if(CavoDecisionFileStore.locks.get(this.file)===next)CavoDecisionFileStore.locks.delete(this.file);}
 }
}
