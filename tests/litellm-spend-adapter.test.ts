import test from 'node:test';
import assert from 'node:assert/strict';
import {importLiteLLMSpend} from '../src/litellm-spend-adapter.js';
const args={baseUrl:'https://litellm.example',apiKey:'test-key',teamId:'team-1',
 partnerId:'p',customerId:'c',from:'2026-11-01T00:00:00Z',to:'2026-11-03T00:00:00Z'};
const row={request_id:'req-1',team_id:'team-1',model:'test-model',
 custom_llm_provider:'openai',startTime:'2026-11-01T12:00:00Z',spend:0.15,
 metadata:{secret:'never store'},prompt:'never store'};
test('LiteLLM paginated spend logs are scoped and minimized',async()=>{
 const fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input));assert.equal(url.pathname,'/spend/logs/v2');
  assert.equal(url.searchParams.get('team_id'),'team-1');
  assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer test-key');
  const page=Number(url.searchParams.get('page'));
  return new Response(JSON.stringify({data:page===1?[row]:[],total:1,
   page,page_size:100,total_pages:2}),{status:200});
 };
 const r=await importLiteLLMSpend({...args,fetcher:fetcher as typeof fetch});
 assert.equal(r.pages,2);assert.equal(r.usage[0].amountMinor,15);
 assert.equal(r.usage[0].customerId,'c');
 assert.equal(JSON.stringify(r).includes('never store'),false);
});
test('LiteLLM rejects cross-team records',async()=>{
 const fetcher=async()=>new Response(JSON.stringify({data:[{...row,team_id:'other'}],
  total:1,page:1,page_size:100,total_pages:1}),{status:200});
 await assert.rejects(importLiteLLMSpend({...args,fetcher:fetcher as typeof fetch}),
  /litellm_team_scope_violation/);
});
test('LiteLLM unknown spend is reported, not counted as zero',async()=>{
 const fetcher=async()=>new Response(JSON.stringify({data:[{...row,spend:null}],
  total:1,page:1,page_size:100,total_pages:1}),{status:200});
 const r=await importLiteLLMSpend({...args,fetcher:fetcher as typeof fetch});
 assert.deepEqual(r.unpriced,['req-1']);assert.equal(r.usage.length,0);
});
