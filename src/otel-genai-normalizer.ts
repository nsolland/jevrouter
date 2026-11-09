/** OpenTelemetry GenAI span attributes -> metered usage.
 * Prices must be supplied from a versioned rate card; token counts alone are not money.
 * Prompt bodies are never ingested.
 */
import type {MeteredUsage} from './partner-pilot.js';
import type {CorrelatedUsage} from './cross-source-dedup.js';
export type GenAiSpan={traceId:string;spanId:string;timestamp:string;
 attributes:Record<string,string|number|boolean|undefined>};
export type RateCard={provider:string;model:string;currency:string;
 inputPerMillionMinor:number;outputPerMillionMinor:number;effectiveFrom:string};
const count=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
export function normalizeGenAiSpans(args:{partnerId:string;customerId:string;
 spans:readonly GenAiSpan[];rates:readonly RateCard[];currency:string}):
 {usage:CorrelatedUsage[];unpriced:string[];skipped:string[]} {
 const usage:CorrelatedUsage[]=[],unpriced:string[]=[],skipped:string[]=[];
 const seen=new Set<string>();
 for(const span of args.spans){
  const key=span.traceId+':'+span.spanId;
  if(!span.traceId||!span.spanId||seen.has(key))throw Error('duplicate_or_missing_span');
  seen.add(key);
  const a=span.attributes;
  const provider=a['gen_ai.provider.name']??a['gen_ai.system'];
  const model=a['gen_ai.response.model']??a['gen_ai.request.model'];
  const input=count(a['gen_ai.usage.input_tokens']);
  const output=count(a['gen_ai.usage.output_tokens']);
  if(typeof provider!=='string'||typeof model!=='string'||input===null||output===null||
     !Number.isFinite(Date.parse(span.timestamp))){skipped.push(key);continue;}
  const rates=args.rates.filter(r=>r.provider===provider&&r.model===model&&
   r.currency===args.currency&&r.effectiveFrom<=span.timestamp.slice(0,10));
  rates.sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom));
  const rate=rates[0];
  if(!rate){unpriced.push(key);continue;}
  if(!Number.isSafeInteger(rate.inputPerMillionMinor)||rate.inputPerMillionMinor<0||
     !Number.isSafeInteger(rate.outputPerMillionMinor)||rate.outputPerMillionMinor<0)
    throw Error('invalid_rate');
  const amount=Math.round((input*rate.inputPerMillionMinor+
   output*rate.outputPerMillionMinor)/1000000);
  if(!Number.isSafeInteger(amount)||amount<0)throw Error('invalid_cost');
  usage.push({id:key,partnerId:args.partnerId,customerId:args.customerId,
   source:'otel-genai-span',provider,model,workflow:String(a['gen_ai.workflow.name']??'unattributed'),
   occurredAt:span.timestamp,amountMinor:amount,currency:args.currency,
   ...(typeof a['gen_ai.request.id']==='string'&&a['gen_ai.request.id']?
    {correlationId:a['gen_ai.request.id'] as string}:{}),costAuthority:'ESTIMATED'});
 }
 return {usage,unpriced,skipped};
}
