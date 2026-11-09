/** Strict Promptfoo results.json adapter.
 * Requires explicit task/variant and externally scored quality/review metrics.
 * Raw prompt, response, grading rationale and variables never leave this boundary.
 */
import {createHash} from 'node:crypto';
import {importPromptfooMatchedEvaluation,type PromptfooEvalRow} from './promptfoo-evaluation-import.js';
type Dict=Record<string,unknown>;
const object=(v:unknown):Dict|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Dict:null;
export function importPromptfooResultsJson(args:{partnerId:string;customerId:string;
 document:string;expectedSha256:string}){
 if(!/^sha256:[a-f0-9]{64}$/.test(args.expectedSha256))
  throw Error('invalid_promptfoo_provenance');
 const digest='sha256:'+createHash('sha256').update(args.document).digest('hex');
 if(digest!==args.expectedSha256)throw Error('promptfoo_digest_mismatch');
 let parsed:unknown;
 try{parsed=JSON.parse(args.document);}catch{throw Error('invalid_promptfoo_json');}
 const root=object(parsed);
 const results=object(root?.results);
 const rows=Array.isArray(results?.results)?results.results:
  Array.isArray(root?.results)?root.results:null;
 if(!rows||rows.length===0||rows.length>100000)
  throw Error('invalid_promptfoo_results');
 const normalized:PromptfooEvalRow[]=[];
 for(const value of rows){
  const r=object(value),test=object(r?.testCase),vars=object(test?.vars);
  const metadata=object(test?.metadata);
  const response=object(r?.response);
  const grading=object(r?.gradingResult);
  const taskId=metadata?.taskId??vars?.taskId;
  const variant=metadata?.variant??vars?.variant;
  const model=r?.provider?.toString()??'';
  const cost=response?.cost;
  const latency=response?.latencyMs;
  const review=metadata?.reviewMinutes;
  const quality=metadata?.qualityScore??grading?.score;
  const accepted=metadata?.accepted;
  if(typeof taskId!=='string'||!taskId||
   (variant!=='baseline'&&variant!=='candidate')||
   typeof model!=='string'||!model||
   typeof cost!=='number'||!Number.isFinite(cost)||cost<0||
   !Number.isSafeInteger(Math.round(cost*100))||
   typeof latency!=='number'||!Number.isFinite(latency)||latency<0||
   typeof review!=='number'||!Number.isFinite(review)||review<0||
   typeof quality!=='number'||!Number.isFinite(quality)||quality<0||quality>1||
   typeof accepted!=='boolean')throw Error('incomplete_promptfoo_metrics');
  normalized.push({id:taskId,variant,model,costMinor:Math.round(cost*100),
   latencyMs:latency,reviewMinutes:review,qualityScore:quality,accepted});
 }
 return importPromptfooMatchedEvaluation({partnerId:args.partnerId,
  customerId:args.customerId,rows:normalized,sourceDigest:digest});
}
