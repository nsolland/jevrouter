import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGenAiSpans} from '../src/otel-genai-normalizer.js';
test('GenAI OTel spans use input/output token totals and rate card, not cache double counting',()=>{
 const result=normalizeGenAiSpans({partnerId:'p',customerId:'c',currency:'NOK',
 rates:[{provider:'openai',model:'m',currency:'NOK',effectiveFrom:'2026-11-01',
 inputPerMillionMinor:1000000,outputPerMillionMinor:2000000}],
 spans:[{traceId:'t',spanId:'s',timestamp:'2026-11-09T12:00:00Z',
 attributes:{'gen_ai.provider.name':'openai','gen_ai.response.model':'m',
 'gen_ai.usage.input_tokens':100,'gen_ai.usage.output_tokens':50,
 'gen_ai.usage.cache_read.input_tokens':30,'gen_ai.workflow.name':'research'}}]});
 assert.equal(result.usage[0].amountMinor,200);
 assert.equal(result.usage[0].workflow,'research');
 assert.deepEqual(result.unpriced,[]);
});
test('unpriced spans remain explicit and are not silently assigned zero cost',()=>{
 const result=normalizeGenAiSpans({partnerId:'p',customerId:'c',currency:'NOK',
 rates:[],spans:[{traceId:'t',spanId:'s',timestamp:'2026-11-09',
 attributes:{'gen_ai.provider.name':'openai','gen_ai.request.model':'m',
 'gen_ai.usage.input_tokens':1,'gen_ai.usage.output_tokens':2}}]});
 assert.equal(result.usage.length,0);
 assert.deepEqual(result.unpriced,['t:s']);
});
