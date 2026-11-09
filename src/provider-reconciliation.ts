/** Reconcile provider invoices with metered usage without treating gaps as savings.
 * Provider totals are compared only when the invoice fully covers the report period.
 * Invoices for partial periods are excluded and reported as coverage gaps.
 */
import type {InvoiceLine,MeteredUsage} from './partner-pilot.js';
export type ProviderReconciliation={provider:string;currency:string;usageMinor:number;
 invoiceMinor:number|null;differenceMinor:number|null;status:'MATCH'|'MISMATCH'|'NO_INVOICE'|'PARTIAL_COVERAGE';
 invoiceIds:string[];usageIds:string[]};
const validDate=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&
 !Number.isNaN(Date.parse(d+'T00:00:00Z'));
export function reconcileProviderCosts(args:{partnerId:string;customerId:string;
 periodStart:string;periodEnd:string;currency:string;
 usage:readonly MeteredUsage[];invoices:readonly InvoiceLine[];
 toleranceMinor?:number}):ProviderReconciliation[]{
 const {partnerId,customerId,periodStart,periodEnd,currency}=args;
 const tolerance=args.toleranceMinor??0;
 if(!validDate(periodStart)||!validDate(periodEnd)||periodStart>periodEnd||
 !Number.isSafeInteger(tolerance)||tolerance<0)throw Error('invalid_reconciliation_period');
 const providers=new Set<string>();
 const ids=new Set<string>();
 for(const [kind,items] of [['usage',args.usage],['invoice',args.invoices]] as const){
  for(const item of items){
   if(item.partnerId!==partnerId||item.customerId!==customerId)throw Error('reconciliation_scope_denied');
   if(item.currency!==currency)throw Error('reconciliation_currency_mismatch');
   if(!item.id||!item.provider||!Number.isSafeInteger(item.amountMinor)||item.amountMinor<0)
    throw Error('invalid_reconciliation_record');
   const key=kind+':'+item.id;if(ids.has(key))throw Error('duplicate_reconciliation_record');
   ids.add(key);providers.add(item.provider);
  }
 }
 const results:ProviderReconciliation[]=[];
 for(const provider of [...providers].sort()){
  const usage=args.usage.filter(u=>u.provider===provider&&u.occurredAt.slice(0,10)>=periodStart&&u.occurredAt.slice(0,10)<=periodEnd);
  const invoices=args.invoices.filter(i=>i.provider===provider&&i.periodStart<=periodEnd&&i.periodEnd>=periodStart);
  const sum=(items:readonly {amountMinor:number}[])=>{
   const n=items.reduce((s,i)=>s+i.amountMinor,0);
   if(!Number.isSafeInteger(n))throw Error('reconciliation_overflow');return n;
  };
  const complete=invoices.length>0&&invoices.every(i=>i.periodStart>=periodStart&&i.periodEnd<=periodEnd);
  // Exact coverage requires consecutive, non-overlapping invoice intervals.
  const ordered=[...invoices].sort((a,b)=>a.periodStart.localeCompare(b.periodStart));
  let cursor=periodStart;
  let covered=complete;
  for(const i of ordered){
   if(!validDate(i.periodStart)||!validDate(i.periodEnd)||i.periodEnd<i.periodStart||
    i.periodStart!==cursor){covered=false;break;}
   const next=new Date(Date.parse(i.periodEnd+'T00:00:00Z')+86400000);
   cursor=next.toISOString().slice(0,10);
  }
  if(cursor!==new Date(Date.parse(periodEnd+'T00:00:00Z')+86400000).toISOString().slice(0,10))
   covered=false;
  const usageMinor=sum(usage),invoiceMinor=covered?sum(invoices):null;
  const differenceMinor=invoiceMinor===null?null:invoiceMinor-usageMinor;
  results.push({provider,currency,usageMinor,invoiceMinor,differenceMinor,
   status:invoices.length===0?'NO_INVOICE':!covered?'PARTIAL_COVERAGE':
    Math.abs(differenceMinor!)<=tolerance?'MATCH':'MISMATCH',
   invoiceIds:invoices.map(i=>i.id),usageIds:usage.map(u=>u.id)});
 }
 return results;
}
