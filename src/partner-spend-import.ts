/** Bind upstream read-only APIs to a single partner/customer without changing
 * their inference gateway. Invoice sources remain independent and explicit.
 */
import {importLangfuseObservations} from './langfuse-v2-adapter.js';
import {importLiteLLMSpend} from './litellm-spend-adapter.js';
import {composeSpendSources} from './composite-spend-adapter.js';
import type {InvoiceLine,ReadOnlySpendAdapter} from './partner-pilot.js';
import type {SpendRecord} from './spend-intelligence.js';
export function createPartnerSpendImport(args:{
 partnerId:string;customerId:string;from:string;to:string;
 langfuse?:{baseUrl:string;publicKey:string;secretKey:string;fetcher?:typeof fetch};
 litellm?:{baseUrl:string;apiKey:string;teamId:string;fetcher?:typeof fetch};
 invoices?:ReadOnlySpendAdapter;
}){
 const sources:ReadOnlySpendAdapter[]=[];
 if(args.langfuse){
  const cfg=args.langfuse;
  sources.push({id:'langfuse',
   async readUsage(p,c){
    if(p!==args.partnerId||c!==args.customerId)throw Error('import_scope_denied');
    const result=await importLangfuseObservations({...cfg,partnerId:p,customerId:c,
     from:args.from,to:args.to});
    if(result.unpriced.length)throw Error('langfuse_unpriced_observations');
    return result.usage;
   },async readInvoices(){return [];}});
 }
 if(args.litellm){
  const cfg=args.litellm;
  sources.push({id:'litellm',
   async readUsage(p,c){
    if(p!==args.partnerId||c!==args.customerId)throw Error('import_scope_denied');
    return (await importLiteLLMSpend({...cfg,partnerId:p,customerId:c,
     from:args.from,to:args.to})).usage;
   },async readInvoices(){return [];}});
 }
 if(args.invoices)sources.push(args.invoices);
 if(!sources.length)throw Error('no_import_sources');
 return composeSpendSources({partnerId:args.partnerId,customerId:args.customerId,
  sources,preferredSources:['litellm-spend-v2','langfuse-observations-v2']});
}

/** Scan uses the same consolidated source adapter as reporting; missing actors fail closed. */
export async function readAttributedSpend(args:Parameters<typeof createPartnerSpendImport>[0],
 ):Promise<SpendRecord[]>{
 const adapter=createPartnerSpendImport(args);
 const usage=await adapter.readUsage(args.partnerId,args.customerId);
 if(!usage.length||usage.some(u=>!u.actorId?.trim()))throw Error('actor_attribution_missing');
 return usage.map(u=>({id:u.id,tenantId:u.customerId,provider:u.provider,
  amountMinor:u.amountMinor,currency:u.currency,occurredAt:u.occurredAt,
  actorId:u.actorId!,department:'unattributed',useCase:u.workflow,model:u.model}));
}
