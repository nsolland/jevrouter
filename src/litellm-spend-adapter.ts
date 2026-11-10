/** LiteLLM /spend/logs/v2 read-only import.
 * One configured LiteLLM team is bound to one authenticated customer.
 * Never retain request/response, user metadata or API keys.
 */
import type {CorrelatedUsage} from './cross-source-dedup.js';
export async function importLiteLLMSpend(args:{baseUrl:string;apiKey:string;teamId:string;
 partnerId:string;customerId:string;from:string;to:string;
 fetcher?:typeof fetch;maxPages?:number}):Promise<{usage:CorrelatedUsage[];unpriced:string[];pages:number}>{
 const base=new URL(args.baseUrl);
 if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))
  throw Error('litellm_https_required');
 if(!args.apiKey||!args.teamId||!args.partnerId||!args.customerId)
  throw Error('missing_litellm_scope');
 const format=(s:string)=>{const d=new Date(s);if(!Number.isFinite(d.getTime()))throw Error('invalid_litellm_window');
  return d.toISOString().slice(0,19).replace('T',' ');};
 const from=format(args.from),to=format(args.to);
 if(from>=to)throw Error('invalid_litellm_window');
 const maxPages=args.maxPages??100;
 if(!Number.isSafeInteger(maxPages)||maxPages<1)throw Error('invalid_litellm_limit');
 const seen=new Set<string>(),usage:CorrelatedUsage[]=[],unpriced:string[]=[];
 for(let page=1;page<=maxPages;page++){
  const url=new URL('/spend/logs/v2',base);
  for(const [k,v] of Object.entries({start_date:from,end_date:to,team_id:args.teamId,
   page:String(page),page_size:'100'}))url.searchParams.set(k,v);
  const response=await (args.fetcher??fetch)(url,{headers:{
   Authorization:'Bearer '+args.apiKey,Accept:'application/json'}});
  if(!response.ok)throw Error('litellm_http_'+response.status);
  const raw:unknown=await response.json();
  if(!raw||typeof raw!=='object')throw Error('invalid_litellm_response');
  const b=raw as Record<string,unknown>;
  if(!Array.isArray(b.data)||!Number.isSafeInteger(b.total_pages)||
   (b.total_pages as number)<0||!Number.isSafeInteger(b.page)||
   b.page!==page||b.data.length>100)throw Error('invalid_litellm_page');
  for(const value of b.data){
   if(!value||typeof value!=='object')throw Error('invalid_litellm_row');
   const r=value as Record<string,unknown>;
   if(r.team_id!==args.teamId)throw Error('litellm_team_scope_violation');
   if(typeof r.request_id!=='string'||!r.request_id||seen.has(r.request_id))
    throw Error('duplicate_litellm_request');
   seen.add(r.request_id);
   if(typeof r.startTime!=='string'||!Number.isFinite(Date.parse(r.startTime))||
    typeof r.model!=='string'||!r.model)throw Error('invalid_litellm_row');
   if(r.spend===null||r.spend===undefined){unpriced.push(r.request_id);continue;}
   const amount=typeof r.spend==='number'?r.spend:NaN;
   if(!Number.isFinite(amount)||amount<0||!Number.isSafeInteger(Math.round(amount*100)))
    throw Error('invalid_litellm_spend');
   usage.push({id:'litellm:'+r.request_id,correlationId:r.request_id,
    costAuthority:'BILLED',partnerId:args.partnerId,
    customerId:args.customerId,source:'litellm-spend-v2',
    provider:typeof r.custom_llm_provider==='string'?r.custom_llm_provider:'unknown',
    model:r.model,workflow:'unattributed',
    ...(typeof r.user==='string'&&r.user.trim()&&r.user.length<=128?{actorId:r.user}:{}),
    occurredAt:r.startTime,
    amountMinor:Math.round(amount*100),currency:'USD'});
  }
  if(page>=(b.total_pages as number))return {usage,unpriced,pages:page};
 }
 throw Error('litellm_page_limit_exceeded');
}
