/** Read-only Langfuse v4 Observations API v2 import.
 * One Langfuse project credential must be bound to one partner/customer by the caller.
 * No IO, prompt or metadata fields are requested.
 * Cost is USD; conversion to minor units is exact to the nearest cent.
 */
import type {MeteredUsage} from './partner-pilot.js';
type Fetcher=typeof fetch;
export type LangfuseImport={usage:MeteredUsage[];unpriced:string[];pages:number};
export async function importLangfuseObservations(args:{
 baseUrl:string;publicKey:string;secretKey:string;partnerId:string;customerId:string;
 from:string;to:string;fetcher?:Fetcher;maxPages?:number
}):Promise<LangfuseImport>{
 const u=new URL(args.baseUrl);
 if(u.protocol!=='https:'&&u.hostname!=='localhost'&&u.hostname!=='127.0.0.1')
  throw Error('langfuse_https_required');
 if(!args.partnerId||!args.customerId||!args.publicKey||!args.secretKey)
  throw Error('missing_langfuse_scope_or_credentials');
 if(!Number.isFinite(Date.parse(args.from))||!Number.isFinite(Date.parse(args.to))||
  Date.parse(args.from)>=Date.parse(args.to))throw Error('invalid_langfuse_window');
 const maxPages=args.maxPages??100;
 if(!Number.isSafeInteger(maxPages)||maxPages<1)throw Error('invalid_langfuse_page_limit');
 const seenCursors=new Set<string>(),seenIds=new Set<string>();
 const usage:MeteredUsage[]=[],unpriced:string[]=[];
 let cursor:string|null=null;
 for(let page=0;page<maxPages;page++){
  const url=new URL('/api/public/v2/observations',u);
  url.searchParams.set('fields','core,basic,model,usage');
  url.searchParams.set('type','GENERATION');
  url.searchParams.set('fromStartTime',args.from);
  url.searchParams.set('toStartTime',args.to);
  url.searchParams.set('limit','100');
  if(cursor)url.searchParams.set('cursor',cursor);
  const response=await (args.fetcher??fetch)(url,{
   headers:{Authorization:'Basic '+Buffer.from(args.publicKey+':'+args.secretKey).toString('base64'),
    Accept:'application/json'}});
  if(!response.ok)throw Error('langfuse_http_'+response.status);
  const body:unknown=await response.json();
  if(!body||typeof body!=='object'||!('data' in body)||!Array.isArray(body.data))
   throw Error('invalid_langfuse_response');
  const b=body as {data:unknown[];meta?:{cursor?:unknown}};
  for(const item of b.data){
   if(!item||typeof item!=='object')throw Error('invalid_langfuse_observation');
   const o=item as Record<string,unknown>;
   if(typeof o.id!=='string'||!o.id||seenIds.has(o.id))
    throw Error('duplicate_langfuse_observation');
   seenIds.add(o.id);
   if(o.type!=='GENERATION')continue;
   if(typeof o.startTime!=='string'||!Number.isFinite(Date.parse(o.startTime))||
    typeof o.model!=='string'||!o.model) {unpriced.push(o.id);continue;}
   if(o.totalCost===null||o.totalCost===undefined){unpriced.push(o.id);continue;}
   const cost=typeof o.totalCost==='string'?Number(o.totalCost):o.totalCost;
   if(typeof cost!=='number'||!Number.isFinite(cost)||cost<0||
    !Number.isSafeInteger(Math.round(cost*100)))throw Error('invalid_langfuse_cost');
   usage.push({id:'langfuse:'+o.id,partnerId:args.partnerId,customerId:args.customerId,
    source:'langfuse-observations-v2',provider:'langfuse',
    model:o.model,workflow:typeof o.name==='string'?o.name:'unattributed',
    occurredAt:o.startTime,amountMinor:Math.round(cost*100),currency:'USD'});
  }
  const next=b.meta?.cursor;
  if(next===undefined||next===null)return {usage,unpriced,pages:page+1};
  if(typeof next!=='string'||!next||seenCursors.has(next))throw Error('langfuse_cursor_cycle');
  seenCursors.add(next);cursor=next;
 }
 throw Error('langfuse_page_limit_exceeded');
}
