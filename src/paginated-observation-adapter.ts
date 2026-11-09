/** Provider-independent, read-only cursor ingestion.
 * Transport is injected: this module does not assume provider API paths,
 * authentication formats or response envelopes.
 */
import type {ReadOnlySpendAdapter,MeteredUsage,InvoiceLine} from './partner-pilot.js';
export type ObservationPage<T>={items:readonly T[];nextCursor:string|null};
export type ObservationTransport<T>=(
 args:{partnerId:string;customerId:string;cursor:string|null;limit:number}
)=>Promise<ObservationPage<T>>;
export async function collectScopedPages<T extends {partnerId:string;customerId:string;id:string}>(
 transport:ObservationTransport<T>,partnerId:string,customerId:string,
 opts:{limit?:number;maxPages?:number}={}
):Promise<T[]>{
 const limit=opts.limit??100,maxPages=opts.maxPages??1000;
 if(!Number.isSafeInteger(limit)||limit<1||limit>1000||
 !Number.isSafeInteger(maxPages)||maxPages<1)throw Error('invalid_pagination_limits');
 const all:T[]=[],cursors=new Set<string>(),ids=new Set<string>();
 let cursor:string|null=null;
 for(let pageNumber=0;pageNumber<maxPages;pageNumber++){
  const page=await transport({partnerId,customerId,cursor,limit});
  if(!page||!Array.isArray(page.items)||page.items.length>limit||
   (page.nextCursor!==null&&typeof page.nextCursor!=='string'))
   throw Error('invalid_page');
  for(const item of page.items){
   if(item.partnerId!==partnerId||item.customerId!==customerId)
    throw Error('source_scope_violation');
   if(!item.id||ids.has(item.id))throw Error('duplicate_observation');
   ids.add(item.id);all.push(item);
  }
  if(page.nextCursor===null)return all;
  if(!page.nextCursor||cursors.has(page.nextCursor))throw Error('pagination_cycle');
  cursors.add(page.nextCursor);cursor=page.nextCursor;
 }
 throw Error('pagination_limit_exceeded');
}
export function createPaginatedSpendAdapter(args:{id:string;
 usage:ObservationTransport<MeteredUsage>;invoices:ObservationTransport<InvoiceLine>;
 maxPages?:number}):ReadOnlySpendAdapter {
 if(!args.id)throw Error('missing_adapter_id');
 return {id:args.id,
 readUsage:(partnerId,customerId)=>collectScopedPages(args.usage,partnerId,customerId,{maxPages:args.maxPages}),
 readInvoices:(partnerId,customerId)=>collectScopedPages(args.invoices,partnerId,customerId,{maxPages:args.maxPages})};
}
