import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PartnerRegistry} from '../src/partner-registry.js';
import {CustomerValueStore} from '../src/customer-value-store.js';
import {createPartnerReportApi} from '../src/partner-report-api.js';
test('customer-only credential owns rubric, partner token cannot change it',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'customer-value-auth-'));
 const registry=new PartnerRegistry(join(dir,'registry.json'));
 const partnerToken='p'.repeat(48),customerToken='c'.repeat(48);
 await registry.provision({partnerId:'p',productName:'Brand',domain:'brand.example.org',
  supportEmail:'ops@example.org',legalEntity:'Partner'},partnerToken);
 await registry.addCustomer('p',partnerToken,{partnerId:'p',customerId:'c',
  displayName:'Customer',enabled:true,allowedDomains:[]});
 const file=join(dir,'value.json'),store=new CustomerValueStore(file);
 await store.provision('p','c',customerToken);
 const server=createPartnerReportApi(registry,async()=>{throw Error('unused')},
  undefined,undefined,undefined,undefined,undefined,store);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const addr=server.address();if(!addr||typeof addr==='string')throw Error('no_port');
  const url='http://127.0.0.1:'+addr.port+'/customers/c/value-rubric';
  const body=JSON.stringify({expectedRevision:0,criteria:[{id:'quality',
   label:'Customer-defined quality',weight:100,enabled:true,
   metric:'quality',minimumEvidence:'measured'}]});
  const put=(token:string,expectedBody=body)=>fetch(url,{method:'PUT',headers:{
   'x-partner-id':'p','x-customer-value-token':token,'content-type':'application/json'},
   body:expectedBody});
  assert.equal((await put(partnerToken)).status,401);
  assert.equal((await put(customerToken)).status,200);
  assert.equal((await put(customerToken)).status,409);
  const read=await fetch(url,{headers:{'x-partner-id':'p',
   'x-customer-value-token':customerToken}});
  assert.equal(read.status,200);
  const result=await read.json() as {rubric:{revision:number;criteria:Array<{metric:string}>}};
  assert.equal(result.rubric.revision,1);
  assert.equal(result.rubric.criteria[0].metric,'quality');
  assert.equal((await fetch(url,{headers:{'x-partner-id':'p',
   'x-customer-value-token':partnerToken}})).status,401);
  const headers={'x-partner-id':'p','x-customer-value-token':customerToken};
  const history=await fetch(url.replace('value-rubric','value-history'),{headers});
  assert.equal(history.status,200);
  assert.equal(((await history.json()) as {items:unknown[]}).items.length,1);
  const {proposeValueHypotheses}=await import('../src/customer-value-evaluator.js');
  const signal=proposeValueHypotheses([{id:'1',tenantId:'c',provider:'p',amountMinor:100,
   currency:'USD',occurredAt:'2026-11-10T12:00:00Z',actorId:'a',department:'d',
   useCase:'work',model:'m'}],'c')[0];
  const decisionUrl=url.replace('value-rubric','value-decisions');
  const decisionBody=JSON.stringify({signalId:signal.id,decision:'REJECT',
   rationale:'Customer prioritizes quality over lower spend',expectedRevision:1});
  assert.equal((await fetch(decisionUrl,{method:'POST',headers:{...headers,
   'content-type':'application/json'},body:decisionBody})).status,200);
  assert.equal((await fetch(decisionUrl,{method:'POST',headers:{'x-partner-id':'p',
   'x-customer-value-token':partnerToken,'content-type':'application/json'},
   body:decisionBody})).status,401);
  const decisions=await fetch(decisionUrl,{headers});
  assert.equal(((await decisions.json()) as {items:Array<{decision:string}>}).items[0].decision,'REJECT');
  assert.equal((await stat(file)).mode&0o077,0);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
