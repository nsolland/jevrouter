import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PartnerRegistry} from '../src/partner-registry.js';
import {createMultiPartnerService} from '../src/partner-service.js';
const response=(user?:string)=>new Response(JSON.stringify({data:[{
 request_id:'req1',team_id:'team',startTime:'2026-11-10T12:00:00Z',
 model:'model-a',spend:12.5,custom_llm_provider:'provider',...(user?{user}:{})}],
 page:1,total_pages:1}),{status:200});
test('authenticated partner portal scans live-shaped LiteLLM with scoped attribution',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'topscan-e2e-'));
 const registry=new PartnerRegistry(join(dir,'registry.json'));
 const token='k'.repeat(48);
 await registry.provision({partnerId:'partner',productName:'Brand',domain:'brand.example.org',
  supportEmail:'ops@example.org',legalEntity:'Partner'},token);
 await registry.addCustomer('partner',token,{partnerId:'partner',customerId:'customer',
  displayName:'Customer',enabled:true,allowedDomains:[]});
 const server=createMultiPartnerService({registryFile:join(dir,'registry.json'),tenants:[{
  partnerId:'partner',customerId:'customer',litellm:{baseUrl:'https://litellm.example.org',
   apiKey:'secret',teamId:'team',fetcher:async()=>response('user42')}}]});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const address=server.address();if(!address||typeof address==='string')throw Error('no_port');
  const url='http://127.0.0.1:'+address.port+
   '/customers/customer/top-spend?from=2026-11-01&to=2026-11-30&currency=USD';
  const headers={'x-partner-id':'partner',authorization:'Bearer '+token};
  const result=await fetch(url,{headers});
  assert.equal(result.status,200);
  const body=await result.json() as {population:{topSharePct:number};
   topConsumers:Array<{actorId:string;byModel:Record<string,number>}>};
  assert.equal(body.population.topSharePct,100);
  assert.equal(body.topConsumers[0].actorId,'user42');
  assert.equal(body.topConsumers[0].byModel['model-a'],1250);
  assert.equal((await fetch(url.replace('/customer/','/other/'),{headers})).status,404);
  assert.equal((await fetch(url)).status,401);
  const evaluation=await fetch(url.replace('/top-spend','/value-evaluation'),{headers});
  assert.equal(evaluation.status,200);
  const advisory=await evaluation.json() as {rubricStatus:string;hypotheses:Array<{evidence:string}>;evaluation:null};
  assert.equal(advisory.rubricStatus,'CUSTOMER_RUBRIC_NOT_VERIFIED');
  assert.equal(advisory.hypotheses[0].evidence,'hypothesis');
  assert.equal(advisory.evaluation,null);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
