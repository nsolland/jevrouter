import test from 'node:test';
import assert from 'node:assert/strict';
import {readAttributedSpend} from '../src/partner-spend-import.js';
const base={partnerId:'p',customerId:'c',from:'2026-11-01T00:00:00Z',
 to:'2026-11-30T23:59:59Z'};
const source=(user?:string)=>({...base,litellm:{baseUrl:'https://litellm.example.org',
 apiKey:'secret',teamId:'team',fetcher:async()=>new Response(JSON.stringify({
  data:[{request_id:'req1',team_id:'team',startTime:'2026-11-10T12:00:00Z',
   model:'model-a',spend:12.50,custom_llm_provider:'provider',...(user?{user}:{})}],
  page:1,total_pages:1}),{status:200})}});
test('live adapter-shaped LiteLLM source produces attributed top-scan spend',async()=>{
 const records=await readAttributedSpend(source('user-42'));
 assert.equal(records.length,1);
 assert.equal(records[0].actorId,'user-42');
 assert.equal(records[0].amountMinor,1250);
 assert.equal(records[0].tenantId,'c');
});
test('missing source user identity fails closed',async()=>{
 await assert.rejects(()=>readAttributedSpend(source()),/actor_attribution_missing/);
});
