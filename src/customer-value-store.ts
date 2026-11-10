/** Customer-owned value criteria. Customer tokens are provisioned out of band,
 * independently of partner/operator credentials. No self-attested identity.
 */
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import type {ValueRubric,ValueCriterion} from './customer-value-evaluator.js';
type Entry={partnerId:string;customerId:string;salt:string;tokenHash:string;
 revision:number;criteria:ValueCriterion[];history?:Array<{revision:number;criteria:ValueCriterion[];changedAt:string}>;
 decisions?:CustomerValueDecision[]};
const id=/^[a-zA-Z0-9_-]{1,128}$/;
export class CustomerValueStore{
 private static pending=new Map<string,Promise<void>>();
 constructor(private readonly file:string){}
 private async locked<T>(fn:()=>Promise<T>):Promise<T>{
  const prior=CustomerValueStore.pending.get(this.file)??Promise.resolve();
  let release!:()=>void;const gate=new Promise<void>(r=>release=r);
  const next=prior.then(()=>gate);CustomerValueStore.pending.set(this.file,next);
  await prior;try{return await fn();}finally{release();
   if(CustomerValueStore.pending.get(this.file)===next)CustomerValueStore.pending.delete(this.file);}
 }
 private async load():Promise<Entry[]>{
  try{const v:unknown=JSON.parse(await readFile(this.file,'utf8'));
   if(!Array.isArray(v))throw Error('invalid_value_store');return v as Entry[];
  }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
 }
 private async save(entries:Entry[]){
  await mkdir(dirname(this.file),{recursive:true,mode:0o700});
  const temp=this.file+'.'+randomBytes(12).toString('hex')+'.tmp';
  await writeFile(temp,JSON.stringify(entries),{flag:'wx',mode:0o600});
  await rename(temp,this.file);
 }
 async provision(partnerId:string,customerId:string,token:string){
  if(!id.test(partnerId)||!id.test(customerId)||token.length<32)throw Error('invalid_customer_credentials');
  return this.locked(async()=>{
   const entries=await this.load();
   if(entries.some(e=>e.partnerId===partnerId&&e.customerId===customerId))
    throw Error('customer_value_identity_exists');
   const salt=randomBytes(16).toString('hex');
   entries.push({partnerId,customerId,salt,
    tokenHash:scryptSync(token,salt,32).toString('hex'),revision:0,criteria:[]});
   await this.save(entries);
  });
 }
 private async authorized(partnerId:string,customerId:string,token:string){
  const entries=await this.load();
  const entry=entries.find(e=>e.partnerId===partnerId&&e.customerId===customerId);
  if(!entry||!token)throw Error('customer_value_auth_denied');
  const actual=scryptSync(token,entry.salt,32);
  const expected=Buffer.from(entry.tokenHash,'hex');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))
   throw Error('customer_value_auth_denied');
  return entry;
 }
 async readAuthorized(partnerId:string,customerId:string,token:string):Promise<ValueRubric|null>{
  await this.authorized(partnerId,customerId,token);
  return this.get(partnerId,customerId);
 }
 async get(partnerId:string,customerId:string):Promise<ValueRubric|null>{
  const entry=(await this.load()).find(e=>e.partnerId===partnerId&&e.customerId===customerId);
  if(!entry||entry.revision===0)return null;
  return {partnerId,customerId,owner:'CUSTOMER',revision:entry.revision,
   criteria:entry.criteria};
 }
 async history(partnerId:string,customerId:string,token:string){
  const entry=await this.authorized(partnerId,customerId,token);
  return entry.history??[];
 }
 async listDecisions(partnerId:string,customerId:string){
  const entry=(await this.load()).find(e=>e.partnerId===partnerId&&e.customerId===customerId);
  return entry?.decisions??[];
 }
 async decisions(partnerId:string,customerId:string,token:string){
  const entry=await this.authorized(partnerId,customerId,token);
  return entry.decisions??[];
 }
 async decideSignal(partnerId:string,customerId:string,token:string,signalId:string,
  decision:CustomerValueDecision['decision'],rationale:string,expectedRevision:number){
  return this.locked(async()=>{
   const entry=await this.authorized(partnerId,customerId,token);
   if(entry.revision<1)throw Error('customer_rubric_required');
   if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==entry.revision)
    throw Error('rubric_revision_conflict');
   if(!/^opportunity-[a-f0-9]{24}$/.test(signalId)||
    !['ACCEPT','REJECT','NEEDS_EVIDENCE'].includes(decision)||
    !rationale?.trim()||rationale.length>2000)throw Error('invalid_value_decision');
   const entries=await this.load();
   const target=entries.find(e=>e.partnerId===partnerId&&e.customerId===customerId)!;
   target.decisions??=[];
   const record={signalId,decision,rationale,revision:target.revision,
    decidedAt:new Date().toISOString()};
   target.decisions.push(record);await this.save(entries);return record;
  });
 }
 async update(partnerId:string,customerId:string,token:string,
  expectedRevision:number,criteria:ValueCriterion[]){
  return this.locked(async()=>{
   const entry=await this.authorized(partnerId,customerId,token);
   if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==entry.revision)
    throw Error('rubric_revision_conflict');
   // Use the evaluator itself for complete rubric validation.
   const {evaluateCustomerValue}=await import('./customer-value-evaluator.js');
   evaluateCustomerValue({partnerId,customerId,records:[],signals:[],
    rubric:{partnerId,customerId,owner:'CUSTOMER',revision:entry.revision+1,criteria}});
   const entries=await this.load();
   const target=entries.find(e=>e.partnerId===partnerId&&e.customerId===customerId)!;
   target.history??=[];target.history.push({revision:target.revision+1,
    criteria:structuredClone(criteria),changedAt:new Date().toISOString()});
   target.revision++;target.criteria=structuredClone(criteria);
   await this.save(entries);
   return {partnerId,customerId,owner:'CUSTOMER' as const,
    revision:target.revision,criteria:target.criteria};
  });
 }
}
export type CustomerValueDecision={signalId:string;decision:'ACCEPT'|'REJECT'|'NEEDS_EVIDENCE';
 rationale:string;revision:number;decidedAt:string};
