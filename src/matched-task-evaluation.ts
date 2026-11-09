/** Matched-task evaluation for AI Value Optimization.
 * Savings are measured for accepted outputs, not token volume alone.
 * This module reports observational comparisons, never causal ROI.
 */
export type TaskObservation={partnerId:string;customerId:string;taskId:string;
 variant:'baseline'|'candidate';model:string;costMinor:number;latencyMs:number;
 accepted:boolean;reviewMinutes:number;qualityScore:number};
export type MatchedTaskResult={taskId:string;baseline:TaskObservation;candidate:TaskObservation;
 costDeltaMinor:number;reviewDeltaMinutes:number;qualityDelta:number};
export function compareMatchedTasks(rows:readonly TaskObservation[],scope:{partnerId:string;customerId:string}){
 const groups=new Map<string,Partial<Record<'baseline'|'candidate',TaskObservation>>>();
 for(const row of rows){
  if(row.partnerId!==scope.partnerId||row.customerId!==scope.customerId)
   throw Error('evaluation_scope_violation');
  if(!row.taskId||!row.model||!Number.isSafeInteger(row.costMinor)||row.costMinor<0||
   !Number.isFinite(row.latencyMs)||row.latencyMs<0||
   !Number.isFinite(row.reviewMinutes)||row.reviewMinutes<0||
   !Number.isFinite(row.qualityScore)||row.qualityScore<0||row.qualityScore>1||
   (row.variant!=='baseline'&&row.variant!=='candidate'))
   throw Error('invalid_task_observation');
  const pair=groups.get(row.taskId)??{};
  if(pair[row.variant])throw Error('duplicate_task_variant');
  pair[row.variant]=row;groups.set(row.taskId,pair);
 }
 const matched:MatchedTaskResult[]=[];
 const unmatched:string[]=[];
 for(const [taskId,pair] of groups){
  if(!pair.baseline||!pair.candidate){unmatched.push(taskId);continue;}
  matched.push({taskId,baseline:pair.baseline,candidate:pair.candidate,
   costDeltaMinor:pair.candidate.costMinor-pair.baseline.costMinor,
   reviewDeltaMinutes:pair.candidate.reviewMinutes-pair.baseline.reviewMinutes,
   qualityDelta:pair.candidate.qualityScore-pair.baseline.qualityScore});
 }
 const sum=(f:(x:MatchedTaskResult)=>number)=>matched.reduce((s,x)=>s+f(x),0);
 const n=matched.length;
 return {partnerId:scope.partnerId,customerId:scope.customerId,matchedCount:n,
  unmatchedTaskIds:unmatched,
  baselineAccepted:matched.filter(x=>x.baseline.accepted).length,
  candidateAccepted:matched.filter(x=>x.candidate.accepted).length,
  totalCostDeltaMinor:sum(x=>x.costDeltaMinor),
  totalReviewDeltaMinutes:sum(x=>x.reviewDeltaMinutes),
  meanQualityDelta:n?sum(x=>x.qualityDelta)/n:null,
  candidateImprovesAll:n>0&&matched.every(x=>x.candidate.accepted&&
   x.candidate.qualityScore>=x.baseline.qualityScore&&x.costDeltaMinor<=0),
  causalStatus:'NOT_ESTABLISHED' as const,
  limitations:['Matched observational tasks do not establish causality.',
   'Human review, failure costs and selection bias must be included in economic claims.']};
}
