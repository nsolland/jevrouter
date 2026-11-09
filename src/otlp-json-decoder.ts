/** Decode OTLP/HTTP JSON trace export payloads (OpenTelemetry protobuf JSON mapping).
 * No raw prompts, messages, or arbitrary span attributes leave this boundary.
 * Tenant scope comes from authenticated caller, never from untrusted telemetry.
 */
import type {GenAiSpan} from './otel-genai-normalizer.js';
type Json=Record<string,unknown>;
const obj=(v:unknown):Json|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Json:null;
const arr=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const scalar=(v:unknown):string|number|boolean|undefined=>{
 const a=obj(v);if(!a)return undefined;
 if(typeof a.stringValue==='string')return a.stringValue;
 if(typeof a.boolValue==='boolean')return a.boolValue;
 if(typeof a.intValue==='string'&&/^-?\d+$/.test(a.intValue)){
  const n=Number(a.intValue);return Number.isSafeInteger(n)?n:undefined;
 }
 if(typeof a.intValue==='number'&&Number.isSafeInteger(a.intValue))return a.intValue;
 if(typeof a.doubleValue==='number'&&Number.isFinite(a.doubleValue))return a.doubleValue;
 return undefined;
};
const allowed=new Set(['gen_ai.provider.name','gen_ai.system','gen_ai.response.model',
 'gen_ai.request.model','gen_ai.usage.input_tokens','gen_ai.usage.output_tokens',
 'gen_ai.usage.cache_read.input_tokens','gen_ai.workflow.name',
 'gen_ai.request.id']);
function time(n:unknown):string|null{
 if(typeof n!=='string'||!/^[0-9]+$/.test(n))return null;
 try{const ms=BigInt(n)/1000000n;
  if(ms>8640000000000000n||ms<0n)return null;
  return new Date(Number(ms)).toISOString();
 }catch{return null;}
}
export function decodeOtlpJsonTraces(payload:unknown):{spans:GenAiSpan[];rejected:number}{
 const root=obj(payload);if(!root)throw Error('invalid_otlp_payload');
 const spans:GenAiSpan[]=[];let rejected=0;
 for(const resource of arr(root.resourceSpans)){
  const r=obj(resource);if(!r){rejected++;continue;}
  for(const scope of arr(r.scopeSpans)){
   const s=obj(scope);if(!s){rejected++;continue;}
   for(const raw of arr(s.spans)){
    const span=obj(raw);
    if(!span||typeof span.traceId!=='string'||typeof span.spanId!=='string'){
     rejected++;continue;
    }
    const timestamp=time(span.endTimeUnixNano);
    if(!timestamp){rejected++;continue;}
    const attributes:GenAiSpan['attributes']={};
    for(const attr of arr(span.attributes)){
     const a=obj(attr);
     if(!a||typeof a.key!=='string'||!allowed.has(a.key))continue;
     const value=scalar(a.value);
     if(value!==undefined)attributes[a.key]=value;
    }
    if(!('gen_ai.usage.input_tokens' in attributes)&&
       !('gen_ai.usage.output_tokens' in attributes)){rejected++;continue;}
    spans.push({traceId:span.traceId,spanId:span.spanId,timestamp,attributes});
   }
  }
 }
 return {spans,rejected};
}
