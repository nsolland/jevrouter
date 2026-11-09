import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeOtlpJsonTraces} from '../src/otlp-json-decoder.js';
import {normalizeGenAiSpans} from '../src/otel-genai-normalizer.js';
test('real OTLP JSON envelope becomes priced GenAI usage without prompt text',()=>{
 const payload={resourceSpans:[{scopeSpans:[{spans:[{
  traceId:'0123456789abcdef0123456789abcdef',spanId:'0123456789abcdef',
  endTimeUnixNano:'1794225600000000000',
  attributes:[
   {key:'gen_ai.provider.name',value:{stringValue:'openai'}},
   {key:'gen_ai.response.model',value:{stringValue:'test-model'}},
   {key:'gen_ai.usage.input_tokens',value:{intValue:'100'}},
   {key:'gen_ai.usage.output_tokens',value:{intValue:'50'}},
   {key:'gen_ai.input.messages',value:{stringValue:'secret prompt'}}
  ]}]}]}]};
 const decoded=decodeOtlpJsonTraces(payload);
 assert.equal(decoded.rejected,0);
 assert.equal(decoded.spans.length,1);
 assert.equal(JSON.stringify(decoded).includes('secret prompt'),false);
 const normalized=normalizeGenAiSpans({partnerId:'partner',customerId:'customer',
  spans:decoded.spans,currency:'NOK',rates:[{provider:'openai',model:'test-model',
   currency:'NOK',effectiveFrom:'2026-01-01',
   inputPerMillionMinor:1000000,outputPerMillionMinor:2000000}]});
 assert.equal(normalized.usage.length,1);
 assert.equal(normalized.usage[0].amountMinor,200);
 assert.equal(normalized.usage[0].customerId,'customer');
});
test('reject malformed OTLP payload',()=>{
 assert.throws(()=>decodeOtlpJsonTraces(null),/invalid_otlp_payload/);
});
