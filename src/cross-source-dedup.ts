/** Cross-source metering reconciliation. Never add the same inference twice.
 * Correlation IDs must be explicitly provided by a trusted source adapter.
 * Unlinked events remain separate and are flagged as potentially overlapping.
 */
import type {MeteredUsage} from './partner-pilot.js';
export type CorrelatedUsage=MeteredUsage&{correlationId?:string;costAuthority?:'BILLED'|'ESTIMATED'};
export type Consolidation={usage:CorrelatedUsage[];suppressed:{id:string;keptId:string}[];
 unresolved:string[]};
export function consolidateUsage(args:{partnerId:string;customerId:string;
 records:readonly CorrelatedUsage[];preferredSources?:readonly string[]}):Consolidation{
 const ids=new Set<string>(),groups=new Map<string,CorrelatedUsage[]>();
 const unresolved:string[]=[];
 for(const r of args.records){
  if(r.partnerId!==args.partnerId||r.customerId!==args.customerId)
   throw Error('cross_tenant_usage');
  if(!r.source||!r.id||!r.provider||!r.currency||
   !Number.isSafeInteger(r.amountMinor)||r.amountMinor<0)throw Error('invalid_usage');
  const key=r.source+':'+r.id;
  if(ids.has(key))throw Error('duplicate_source_record');
  ids.add(key);
  // Do not deduplicate on timestamp/model/token similarity.
  const group=r.correlationId?.trim()?r.provider+':'+r.correlationId:'unique:'+key;
  if(!r.correlationId?.trim())unresolved.push(key);
  const entries=groups.get(group)??[];entries.push(r);groups.set(group,entries);
 }
 const usage:CorrelatedUsage[]=[],suppressed:Consolidation['suppressed']=[];
 for(const entries of groups.values()){
  // A repeated correlation within one source is not proof of duplicate billing.
  // Fail closed instead of silently discarding a second charge.
  const sourceCounts=new Set<string>();
  for(const entry of entries){
   if(sourceCounts.has(entry.source))throw Error('correlation_reused_within_source');
   sourceCounts.add(entry.source);
  }
  const currency=new Set(entries.map(x=>x.currency));
  if(currency.size!==1)throw Error('correlated_currency_conflict');
  const ordered=[...entries].sort((a,b)=>{
   const rank=(x:CorrelatedUsage)=>x.costAuthority==='BILLED'?0:1;
   const sourceRank=(x:CorrelatedUsage)=>{
    const n=args.preferredSources?.indexOf(x.source)??-1;
    return n<0?Number.MAX_SAFE_INTEGER:n;
   };
   return rank(a)-rank(b)||sourceRank(a)-sourceRank(b)||
    (a.source+':'+a.id).localeCompare(b.source+':'+b.id);
  });
  const winner=ordered[0];usage.push(winner);
  for(const loser of ordered.slice(1))suppressed.push({
   id:loser.source+':'+loser.id,keptId:winner.source+':'+winner.id});
 }
 return {usage,suppressed,unresolved};
}
