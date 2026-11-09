import test from 'node:test';
import assert from 'node:assert/strict';
import {createPartnerSpendImport} from '../src/partner-spend-import.js';
import {runPartnerPilot} from '../src/partner-pilot.js';
const brand={partnerId:'partner',productName:'Partner AI Spend',supportEmail:'ops@example.org',
 domain:'spend.example.org',legalEntity:'Partner AS'};
const customer={partnerId:'partner',customerId:'a',displayName:'Customer A',enabled:true,
 allowedDomains:['a.example.org']};
test('two read-only provider APIs flow into branded partner report',async()=>{
 let langCalls=0,litCalls=0;
 const adapter=createPartnerSpendImport({partnerId:'partner',customerId:'a',
 from:'2026-11-01T00:00:00Z',to:'2026-11-30T23:59:59Z',
 langfuse:{baseUrl:'https://cloud.langfuse.com',publicKey:'pk',secretKey:'sk',
 fetcher:(async()=>{langCalls++;return new Response(JSON.stringify({
 data:[{id:'lf1',type:'GENERATION',startTime:'2026-11-09T10:00:00Z',
 model:'gpt-test',name:'analysis',totalCost:0.20}],meta:{cursor:null}}));}) as typeof fetch},
 litellm:{baseUrl:'https://llm.example.org',apiKey:'sk',teamId:'team-a',
 fetcher:(async()=>{litCalls++;return new Response(JSON.stringify({
 data:[{request_id:'lit1',team_id:'team-a',startTime:'2026-11-09T10:00:00Z',
 model:'gpt-test',custom_llm_provider:'openai',spend:0.30}],
 total_pages:1,page:1}));}) as typeof fetch}});
 const result=await runPartnerPilot({brand,customer,adapter,periodStart:'2026-11-01',
 periodEnd:'2026-11-30',currency:'USD'});
 assert.equal(result.product,'Partner AI Spend');
 assert.equal(result.report.spend.usageMinor,50);
 assert.equal(langCalls,1);assert.equal(litCalls,1);
 assert.equal(adapter.getLastReconciliation()?.unresolved.length,1);
 await assert.rejects(adapter.readUsage('partner','b'),/composite_scope_violation/);
});
