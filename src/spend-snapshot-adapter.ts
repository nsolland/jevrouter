import type {ReadOnlySpendAdapter,MeteredUsage,InvoiceLine} from './partner-pilot.js';
/** Import snapshots exported from observability and billing tools.
 * Does not make network requests or imply that vendor APIs have been integrated.
 */
export type OTelGenAiRecord={traceId:string;tenantId:string;partnerId:string;
 provider:string;model:string;workflow:string;timestamp:string;
 inputTokens:number;outputTokens:number;inputCostMinor:number;outputCostMinor:number;
 currency:string};
export type BillingRecord={lineId:string;tenantId:string;partnerId:string;
 provider:string;startDate:string;endDate:string;amountMinor:number;currency:string};
const nonnegative=(n:number)=>Number.isSafeInteger(n)&&n>=0;
export function createSnapshotSpendAdapter(args:{id:string;otel:readonly OTelGenAiRecord[];
 billing:readonly BillingRecord[]}):ReadOnlySpendAdapter {
 if(!args.id)throw Error('missing_adapter_id');
 return {id:args.id,
 async readUsage(partnerId,customerId):Promise<readonly MeteredUsage[]> {
  const scoped=args.otel.filter(x=>x.partnerId===partnerId&&x.tenantId===customerId);
  return scoped.map(x=>{
   if(!x.traceId||!x.provider||!x.model||!x.workflow||
      !Number.isFinite(Date.parse(x.timestamp))||
      ![x.inputTokens,x.outputTokens,x.inputCostMinor,x.outputCostMinor].every(nonnegative)||
      x.inputCostMinor>Number.MAX_SAFE_INTEGER-x.outputCostMinor)
     throw Error('invalid_otel_record');
   return {id:x.traceId,partnerId,customerId,source:'otel-snapshot',
    provider:x.provider,model:x.model,workflow:x.workflow,occurredAt:x.timestamp,
    amountMinor:x.inputCostMinor+x.outputCostMinor,currency:x.currency};
  });
 },
 async readInvoices(partnerId,customerId):Promise<readonly InvoiceLine[]> {
  return args.billing.filter(x=>x.partnerId===partnerId&&x.tenantId===customerId).map(x=>{
   if(!x.lineId||!x.provider||!nonnegative(x.amountMinor))
    throw Error('invalid_billing_record');
   return {id:x.lineId,partnerId,customerId,source:'billing-snapshot',
    provider:x.provider,periodStart:x.startDate,periodEnd:x.endDate,
    amountMinor:x.amountMinor,currency:x.currency};
  });
 }};
}
