/** Compose scoped read-only providers into a single partner pilot adapter.
 * Fail closed if one source fails; never report a partial dataset as complete.
 */
import type {ReadOnlySpendAdapter,MeteredUsage,InvoiceLine} from './partner-pilot.js';
import {consolidateUsage,type CorrelatedUsage} from './cross-source-dedup.js';
export function composeSpendSources(args:{partnerId:string;customerId:string;
 sources:readonly ReadOnlySpendAdapter[];preferredSources?:readonly string[]}):
 ReadOnlySpendAdapter&{getLastReconciliation:()=>ReturnType<typeof consolidateUsage>|null}{
 if(!args.partnerId||!args.customerId||!args.sources.length)throw Error('invalid_composite_scope');
 const sourceIds=new Set<string>();
 for(const s of args.sources){if(!s.id||sourceIds.has(s.id))throw Error('duplicate_adapter_id');sourceIds.add(s.id);}
 let last:ReturnType<typeof consolidateUsage>|null=null;
 const scope=(p:string,c:string)=>{if(p!==args.partnerId||c!==args.customerId)throw Error('composite_scope_violation');};
 return {id:'composite:'+args.sources.map(s=>s.id).join(','),
 getLastReconciliation:()=>last,
 async readUsage(p,c){
  scope(p,c);last=null;
  const batches=await Promise.all(args.sources.map(s=>s.readUsage(p,c)));
  const records=batches.flat() as CorrelatedUsage[];
  const result=consolidateUsage({partnerId:p,customerId:c,records,
   preferredSources:args.preferredSources});
  last=result;return result.usage;
 },
 async readInvoices(p,c){
  scope(p,c);
  const batches=await Promise.all(args.sources.map(s=>s.readInvoices(p,c)));
  const invoices=batches.flat();
  const ids=new Set<string>();
  for(const i of invoices){
   if(i.partnerId!==p||i.customerId!==c)throw Error('cross_tenant_invoice');
   const key=i.source+':'+i.id;
   if(ids.has(key))throw Error('duplicate_invoice_record');
   ids.add(key);
  }
  return invoices;
 }};
}
