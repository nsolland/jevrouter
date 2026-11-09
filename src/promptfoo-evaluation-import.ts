/** Import Promptfoo JSON evaluations without storing prompt/response content.
 * A test ID must have exactly one baseline and candidate observation.
 */
import {compareMatchedTasks,type TaskObservation} from './matched-task-evaluation.js';
export type PromptfooEvalRow={id:string;variant:'baseline'|'candidate';
 model:string;costMinor:number;latencyMs:number;reviewMinutes:number;
 qualityScore:number;accepted:boolean;prompt?:unknown;output?:unknown};
export function importPromptfooMatchedEvaluation(args:{partnerId:string;customerId:string;
 rows:readonly PromptfooEvalRow[];sourceDigest:string}){
 if(!args.partnerId||!args.customerId||!/^sha256:[a-f0-9]{64}$/.test(args.sourceDigest))
  throw Error('invalid_promptfoo_provenance');
 const observations:TaskObservation[]=[];
 for(const r of args.rows){
  if(!r||typeof r.id!=='string'||!r.id)throw Error('invalid_promptfoo_row');
  // Explicit allowlist prevents raw prompts and outputs entering reports.
  observations.push({partnerId:args.partnerId,customerId:args.customerId,
   taskId:r.id,variant:r.variant,model:r.model,costMinor:r.costMinor,
   latencyMs:r.latencyMs,reviewMinutes:r.reviewMinutes,
   qualityScore:r.qualityScore,accepted:r.accepted});
 }
 const report=compareMatchedTasks(observations,{partnerId:args.partnerId,
  customerId:args.customerId});
 const acceptedBaseline=observations.filter(x=>x.variant==='baseline'&&x.accepted);
 const acceptedCandidate=observations.filter(x=>x.variant==='candidate'&&x.accepted);
 const unitCost=(rows:TaskObservation[])=>rows.length?
  observations.filter(x=>x.variant===rows[0].variant)
   .reduce((s,x)=>s+x.costMinor,0)/rows.length:null;
 return {source:'promptfoo-json-normalized',sourceDigest:args.sourceDigest,
  ...report,costPerAcceptedTaskMinor:{baseline:unitCost(acceptedBaseline),
   candidate:unitCost(acceptedCandidate)}};
}
