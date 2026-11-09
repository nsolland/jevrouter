import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PartnerRegistry} from '../src/partner-registry.js';
import {createConfiguredPartnerService,listenPartnerService} from '../src/partner-service.js';
test('full local partner journey: onboard, ingest both sources, report, persist, reopen',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'spend-journey-'));
 const registryFile=join(dir,'registry.json'),historyFile=join(dir,'history.json');
 const token='a'.repeat(48),registry=new PartnerRegistry(registryFile);
 await registry.provision({partnerId:'integrator',productName:'Integrator Spend',
  supportEmail:'ops@example.org',domain:'example.org',legalEntity:'Integrator AS'},token);
 const calls={langfuse:0,litellm:0};
 const config={
  registryFile,historyFile,partnerId:'integrator',customerId:'customer',
  langfuse:{baseUrl:'https://cloud.langfuse.com',publicKey:'pk',secretKey:'sk',
   fetcher:(async()=>{calls.langfuse++;return new Response(JSON.stringify({
    data:[{id:'lf',type:'GENERATION',startTime:'2026-11-09T12:00:00Z',
     model:'test-model',totalCost:0.20}],meta:{cursor:null}}));}) as typeof fetch},
  litellm:{baseUrl:'https://litellm.example.org',apiKey:'key',teamId:'team',
   fetcher:(async()=>{calls.litellm++;return new Response(JSON.stringify({
    data:[{request_id:'llm',team_id:'team',startTime:'2026-11-09T12:00:00Z',
     model:'test-model',custom_llm_provider:'openai',spend:0.30}],
    total_pages:1,page:1}));}) as typeof fetch}
 };
 const server=createConfiguredPartnerService(config);
 const address=await listenPartnerService(server,0);
 if(!address||typeof address==='string')throw Error('missing_port');
 const base='http://127.0.0.1:'+address.port;
 const headers={'x-partner-id':'integrator',authorization:'Bearer '+token};
 try{
  const onboard=await fetch(base+'/customers',{method:'POST',
   headers:{...headers,'content-type':'application/json'},
   body:JSON.stringify({customerId:'customer',displayName:'Customer',
    enabled:true,allowedDomains:[]})});
  assert.equal(onboard.status,201);
  const report=await fetch(base+'/reports/customer?from=2026-11-01&to=2026-11-30&currency=USD',{headers});
  assert.equal(report.status,200);
  const data=await report.json();
  assert.equal(data.product,'Integrator Spend');
  assert.equal(data.report.spend.usageMinor,50);
  assert.equal(data.reconciliation.status,'POTENTIAL_OVERLAP');
  assert.deepEqual(calls,{langfuse:1,litellm:1});
  const history=await fetch(base+'/reports/customer/history',{headers});
  assert.equal(history.status,200);
  const saved=await history.json();
  assert.equal(saved.snapshots.length,1);
  assert.equal(saved.snapshots[0].report.report.spend.usageMinor,50);
  const bad=await fetch(base+'/reports/customer/history',{headers:{...headers,
   authorization:'Bearer invalid'}});
  assert.equal(bad.status,401);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
 const reopened=createConfiguredPartnerService(config);
 const newAddress=await listenPartnerService(reopened,0);
 if(!newAddress||typeof newAddress==='string')throw Error('missing_port');
 try{
  const response=await fetch('http://127.0.0.1:'+newAddress.port+
   '/reports/customer/history',{headers});
  assert.equal(response.status,200);
  assert.equal((await response.json()).snapshots.length,1);
 }finally{await new Promise<void>((resolve,reject)=>reopened.close(e=>e?reject(e):resolve()));}
});
