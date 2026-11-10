/** Customer-owned access policy: recommendations have no authority until approved.
 * An approval requires a distinct organization principal, not partner credentials.
 */
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
export type PolicyRule={role:string;resource:string;action:string;model:string;decision:'ALLOW'|'DENY'};
export type PolicyRecord={id:string;partnerId:string;customerId:string;revision:number;
 status:'PROPOSED'|'APPROVED'|'REJECTED';rules:PolicyRule[];digest:string;
 proposedBy:string;approvedBy?:string;approvedAt?:string;createdAt:string};
const idPattern=/^[a-zA-Z0-9_-]{1,128}$/;
const digest=(rules:PolicyRule[])=>createHash('sha256').update(JSON.stringify(rules)).digest('hex');
const valid=(r:PolicyRule)=>r&&['ALLOW','DENY'].includes(r.decision)&&
 [r.role,r.resource,r.action,r.model].every(x=>typeof x==='string'&&
 x.length>0&&x.length<=128&&!/[\x00-\x1f]/.test(x));
export class CustomerPolicyStore{
 private static pending=new Map<string,Promise<void>>();
 constructor(private readonly file:string){}
 private async locked<T>(fn:()=>Promise<T>):Promise<T>{
  const prior=CustomerPolicyStore.pending.get(this.file)??Promise.resolve();
  let release!:()=>void;const gate=new Promise<void>(r=>release=r);
  const next=prior.then(()=>gate);CustomerPolicyStore.pending.set(this.file,next);
  await prior;try{return await fn();}finally{release();
   if(CustomerPolicyStore.pending.get(this.file)===next)CustomerPolicyStore.pending.delete(this.file);}
 }
 private async load():Promise<PolicyRecord[]>{
  try{const records:unknown=JSON.parse(await readFile(this.file,'utf8'));
   if(!Array.isArray(records))throw Error('invalid_policy_store');
   return records as PolicyRecord[];
  }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
 }
 private async save(records:PolicyRecord[]){
  await mkdir(dirname(this.file),{recursive:true,mode:0o700});
  const temp=this.file+'.'+randomUUID()+'.tmp';
  await writeFile(temp,JSON.stringify(records),{flag:'wx',mode:0o600});
  await rename(temp,this.file);
 }
 async propose(partnerId:string,customerId:string,rules:PolicyRule[],proposedBy:string){
  if(!idPattern.test(partnerId)||!idPattern.test(customerId)||
   !Array.isArray(rules)||rules.length===0||rules.length>200||!rules.every(valid))
   throw Error('invalid_policy_proposal');
  return this.locked(async()=>{
   const records=await this.load();
   const revision=1+Math.max(0,...records.filter(r=>r.partnerId===partnerId&&
    r.customerId===customerId).map(r=>r.revision));
   const record:PolicyRecord={id:randomUUID(),partnerId,customerId,revision,
    status:'PROPOSED',rules,digest:digest(rules),proposedBy,createdAt:new Date().toISOString()};
   records.push(record);await this.save(records);return record;
  });
 }
 async decide(partnerId:string,customerId:string,id:string,decision:'APPROVED'|'REJECTED',
  approver:{id:string;organizationVerified:boolean}){
  if(!approver.organizationVerified||!approver.id)throw Error('organization_approval_required');
  return this.locked(async()=>{
   const records=await this.load();
   const record=records.find(r=>r.id===id&&r.partnerId===partnerId&&r.customerId===customerId);
   if(!record)throw Error('policy_not_found');
   if(record.status!=='PROPOSED')throw Error('policy_already_decided');
   if(record.proposedBy===approver.id)throw Error('separation_of_duties_required');
   if(digest(record.rules)!==record.digest)throw Error('policy_integrity_failure');
   record.status=decision;record.approvedBy=approver.id;record.approvedAt=new Date().toISOString();
   await this.save(records);return record;
  });
 }
 async evaluate(partnerId:string,customerId:string,role:string,resource:string,action:string,model:string){
  const records=(await this.load()).filter(r=>r.partnerId===partnerId&&
   r.customerId===customerId&&r.status==='APPROVED').sort((a,b)=>b.revision-a.revision);
  const active=records[0];
  if(!active||digest(active.rules)!==active.digest)return {decision:'DENY' as const,reason:'no_verified_policy'};
  const matches=active.rules.filter(r=>r.role===role&&r.resource===resource&&
   r.action===action&&r.model===model);
  return {decision:matches.length===1&&matches[0].decision==='ALLOW'?'ALLOW' as const:'DENY' as const,
   reason:'approved_policy',policyId:active.id,revision:active.revision,digest:active.digest};
 }
 async list(partnerId:string,customerId:string){
  return (await this.load()).filter(r=>r.partnerId===partnerId&&r.customerId===customerId);
 }
}
