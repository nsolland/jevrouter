/** Vendor-neutral read-only ingestion of usage and invoice totals.
 * Raw prompts, personal data and provider secrets are not part of this contract.
 */
import {assessAiSpend,type AssessmentReport,type AssessmentEvidence} from './spend-assessment.js';
import {resolveWhiteLabelContext,renderWhiteLabelReport,type PartnerBrand,type PartnerCustomer} from './partner-white-label.js';
export type MeteredUsage={id:string;partnerId:string;customerId:string;source:string;
 provider:string;model:string;workflow:string;occurredAt:string;amountMinor:number;currency:string};
export type InvoiceLine={id:string;partnerId:string;customerId:string;source:string;
 provider:string;periodStart:string;periodEnd:string;amountMinor:number;currency:string};
export interface ReadOnlySpendAdapter {
 readonly id:string;
 readUsage(partnerId:string,customerId:string):Promise<readonly MeteredUsage[]>;
 readInvoices(partnerId:string,customerId:string):Promise<readonly InvoiceLine[]>;
}
const money=(v:number)=>Number.isSafeInteger(v)&&v>=0;
function total(values:readonly number[]):number {
 let sum=0;
 for(const n of values) {if(!money(n)||n>Number.MAX_SAFE_INTEGER-sum)throw Error('invalid_amount');sum+=n;}
 return sum;
}
export async function runPartnerPilot(args:{brand:PartnerBrand;customer:PartnerCustomer;
 adapter:ReadOnlySpendAdapter;periodStart:string;periodEnd:string;currency:string}) {
 const {brand,customer,adapter,periodStart,periodEnd,currency}=args;
 const scope=resolveWhiteLabelContext(brand,customer,brand.partnerId,customer.customerId);
 const [usage,invoices]=await Promise.all([
  adapter.readUsage(brand.partnerId,customer.customerId),
  adapter.readInvoices(brand.partnerId,customer.customerId)]);
 const ids=new Set<string>();
 for(const item of [...usage,...invoices]) {
  if(item.partnerId!==brand.partnerId||item.customerId!==customer.customerId)
   throw Error('source_scope_violation');
  const key=('occurredAt' in item?'usage:':'invoice:')+item.id;
  if(!item.id||ids.has(key))throw Error('duplicate_source_id');
  ids.add(key);
  if(item.currency!==currency)throw Error('currency_mismatch');
  if(!item.source||!item.provider||!money(item.amountMinor))throw Error('invalid_source_record');
 }
 const scopedUsage=usage.filter(u=>u.occurredAt.slice(0,10)>=periodStart&&u.occurredAt.slice(0,10)<=periodEnd);
 const scopedInvoices=invoices.filter(i=>i.periodStart>=periodStart&&i.periodEnd<=periodEnd);
 const evidence:AssessmentEvidence[]=[
  ...scopedUsage.map(u=>({id:'usage:'+u.id,tenantId:customer.customerId,kind:'usage' as const,
   source:u.source,observedAt:u.occurredAt,periodStart:u.occurredAt.slice(0,10),
   periodEnd:u.occurredAt.slice(0,10),digest:u.id,dataClass:'aggregate' as const,verified:false})),
  ...scopedInvoices.map(i=>({id:'invoice:'+i.id,tenantId:customer.customerId,kind:'invoice' as const,
   source:i.source,observedAt:i.periodEnd,periodStart:i.periodStart,
   periodEnd:i.periodEnd,digest:i.id,dataClass:'aggregate' as const,verified:false}))
 ];
 const report:AssessmentReport=assessAiSpend({tenantId:customer.customerId,
  partnerId:brand.partnerId,periodStart,periodEnd,currency,
  invoiceMinor:total(scopedInvoices.map(i=>i.amountMinor)),
  usageMinor:total(scopedUsage.map(u=>u.amountMinor)),evidence});
 return renderWhiteLabelReport(report,scope);
}
