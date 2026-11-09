import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGenAiSpans} from '../src/otel-genai-normalizer.js';
import {importLiteLLMSpend} from '../src/litellm-spend-adapter.js';
import {consolidateUsage} from '../src/cross-source-dedup.js';
test('explicit OTel request id matches LiteLLM billed request, not trace similarity',async()=>{
 const normalized=normalizeGenAiSpans({partnerId:'p',customerId:'c',currency:'USD',
 spans:[{traceId:'trace1',spanId:'span1',timestamp:'2026-11-09T10:00:00Z',
 attributes:{'gen_ai.provider.name':'openai','gen_ai.request.model':'gpt-test',
 'gen_ai.request.id':'request-1','gen_ai.usage.input_tokens':1000000,
 'gen_ai.usage.output_tokens':0}}],
 rates:[{provider:'openai',model:'gpt-test',currency:'USD',
 inputPerMillionMinor:100,outputPerMillionMinor:100,effectiveFrom:'2026-11-01'}]});
 const lit=await importLiteLLMSpend({partnerId:'p',customerId:'c',teamId:'team',
 baseUrl:'https://example.org',apiKey:'key',from:'2026-11-01',to:'2026-11-30',
 fetcher:(async()=>new Response(JSON.stringify({data:[{
 request_id:'request-1',team_id:'team',startTime:'2026-11-09T10:00:00Z',
 model:'gpt-test',custom_llm_provider:'openai',spend:1.5}],
 total_pages:1,page:1}))) as typeof fetch});
 const r=consolidateUsage({partnerId:'p',customerId:'c',
 records:[...normalized.usage,...lit.usage]});
 assert.equal(r.usage.length,1);
 assert.equal(r.usage[0].amountMinor,150);
 assert.equal(r.suppressed.length,1);
 assert.equal(r.unresolved.length,0);
});
