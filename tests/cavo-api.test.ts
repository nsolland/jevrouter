import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PartnerRegistry} from '../src/partner-registry.js';
import {CustomerValueStore} from '../src/customer-value-store.js';
import {CavoDecisionFileStore} from '../src/cavo-decision-loop.js';
import {createPartnerReportApi} from '../src/partner-report-api.js';
test('CAVO customer API authenticates, enforces rubric, persists and retrieves assessment',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cavo-api-'));
 const registry=new PartnerRegistry(join(dir,'partners.json'));
 const partnerToken='p'.repeat(48),customerToken='c'.repeat(48);
 await registry.provision({partnerId:'p',productName:'Brand',domain:'brand.example.org',
  supportEmail:'ops@example.org',legalEntity:'Partner'},partnerToken);
 await registry.addCustomer('p',partnerToken,{partnerId:'p',customerId:'c',
  displayName:'Customer',enabled:true,allowedDomains:[]});
 const values=new CustomerValueStore(join(dir,'values.json'));
 await values.provision('p','c',customerToken);
 await values.update('p','c',customerToken,0,[{id:'quality',label:'Quality',metric:'quality',
  weight:100,enabled:true,minimumEvidence:'customer_attested'}]);
 const server=createPartnerReportApi(registry,async()=>{throw Error('unused')},
  undefined,undefined,undefined,undefined,undefined,values,
  (_p,c)=>new CavoDecisionFileStore(join(dir,c+'.json')));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const address=server.address();if(!address||typeof address==='string')throw Error('no_port');
  const base='http://127.0.0.1:'+address.port+'/customers/c/cavo/';
  const send=(path:string,body:unknown,token=customerToken)=>fetch(base+path,{method:'POST',
   headers:{'x-partner-id':'p','x-customer-value-token':token,
    'content-type':'application/json'},body:JSON.stringify(body)});
  const initiative={id:'i',customerId:'c',rubricRevision:1,title:'Service quality',
   outcomes:[{criterionId:'quality',baseline:3,target:4,unit:'rating',evidence:'CUSTOMER_ATTESTED'}]};
  assert.equal((await send('initiatives',initiative,partnerToken)).status,401);
  assert.equal((await send('initiatives',{...initiative,rubricRevision:2})).status,422);
  assert.equal((await send('initiatives',initiative)).status,201);
  assert.equal((await send('initiatives',initiative)).status,409);
  assert.equal((await send('recommendations',{id:'r',initiativeId:'i',description:'Pilot',
   forecastBenefitMinor:1000,assumptions:['Quality preserved']})).status,201);
  assert.equal((await send('decisions',{id:'d',recommendationId:'r',choice:'PROCEED',
   rationale:'Customer approval',customerActor:'owner',at:'2026-11-10T12:00:00Z'})).status,201);
  assert.equal((await send('allocation-rules',{id:'rule',version:1,method:'USAGE',
   shares:{support:1}})).status,201);
  assert.equal((await send('costs',{id:'failed-attempt',amountMinor:250,currency:'USD',
   actorId:'agent',workflowId:'support',attempt:'FAILED',ruleId:'rule',ruleVersion:1})).status,201);
  assert.equal((await send('follow-ups',{id:'follow-up',decisionId:'d',implemented:true,
   at:'2026-11-11T12:00:00Z',actualCostMinor:500,realizedBenefitMinor:700,
   evidence:'CUSTOMER_ATTESTED',sourceIds:['SYNTHETIC-TEST-SOURCE'],
   outcomes:[{criterionId:'quality',baseline:3,target:4,actual:3.5,unit:'rating',
    evidence:'CUSTOMER_ATTESTED'}]})).status,201);
  const headers={'x-partner-id':'p','x-customer-value-token':customerToken};
  const assessment=await fetch(base+'assessment?decisionId=d',{headers});
  assert.equal(assessment.status,200);
  const assessmentResult=await assessment.json() as {causalRoi:string;forecastVarianceMinor:number;followUps:unknown[]};
  assert.equal(assessmentResult.causalRoi,'NOT_ESTABLISHED');
  assert.equal(assessmentResult.forecastVarianceMinor,-300);
  assert.equal(assessmentResult.followUps.length,1);
  const audit=await fetch(base+'audit',{headers});
  assert.equal(audit.status,200);
  assert.equal(((await audit.json()) as {count:number;valid:boolean}).count,6);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

test('configured service wires CAVO persistence by customer',async()=>{
 const {createConfiguredPartnerService}=await import('../src/partner-service.js');
 const dir=await mkdtemp(join(tmpdir(),'cavo-wiring-'));
 const registry=new PartnerRegistry(join(dir,'partners.json'));
 const token='p'.repeat(48),customerToken='c'.repeat(48);
 await registry.provision({partnerId:'p',productName:'Brand',domain:'brand.example.org',
  supportEmail:'ops@example.org',legalEntity:'Partner'},token);
 await registry.addCustomer('p',token,{partnerId:'p',customerId:'c',displayName:'Customer',
  enabled:true,allowedDomains:[]});
 const values=new CustomerValueStore(join(dir,'values.json'));
 await values.provision('p','c',customerToken);
 await values.update('p','c',customerToken,0,[{id:'quality',label:'Quality',metric:'quality',
  weight:100,enabled:true,minimumEvidence:'customer_attested'}]);
 const server=createConfiguredPartnerService({registryFile:join(dir,'partners.json'),
  partnerId:'p',customerId:'c',customerValueFile:join(dir,'values.json'),
  cavoDirectory:join(dir,'cavo'),invoices:{read:async()=>[]} as never});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const addr=server.address();if(!addr||typeof addr==='string')throw Error('no_port');
  const base='http://127.0.0.1:'+addr.port+'/customers/c/cavo/audit';
  const res=await fetch(base,{headers:{'x-partner-id':'p','x-customer-value-token':customerToken}});
  assert.equal(res.status,200);
  assert.equal(((await res.json()) as {valid:boolean}).valid,true);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

test('portal exposes CAVO assisted event preparation without storing credentials',async()=>{
 const {partnerPortalHtml,partnerPortalJs}=await import('../src/partner-portal.js');
 assert.match(partnerPortalHtml,/id="cavo-template"/);
 assert.match(partnerPortalHtml,/id="cavo-record-id"/);
 assert.match(partnerPortalHtml,/id="cavo-rationale"/);
 assert.match(partnerPortalJs,/rubricRevision:data.rubric.revision/);
 assert.match(partnerPortalJs,/customer-value-token/);
 assert.doesNotMatch(partnerPortalJs,/localStorage|sessionStorage/);
});

test('portal offers explicitly synthetic full-cycle demonstration',async()=>{
 const {partnerPortalHtml,partnerPortalJs}=await import('../src/partner-portal.js');
 assert.match(partnerPortalHtml,/id="cavo-run-synthetic"/);
 assert.match(partnerPortalJs,/SYNTHETIC DEMO COMPLETE/);
 assert.match(partnerPortalJs,/cavoRequest\('follow-ups'/);
 assert.match(partnerPortalJs,/cavoRequest\('assessment\?decisionId='/);
});

test('customer portal CAVO form can submit without editing JSON and its script parses',async()=>{
 const {Script}=await import('node:vm');
 const {partnerPortalHtml,partnerPortalJs}=await import('../src/partner-portal.js');
 assert.doesNotThrow(()=>new Script(partnerPortalJs));
 assert.match(partnerPortalHtml,/id="cavo-submit-form"/);
 assert.match(partnerPortalJs,/async function cavoFormPayload/);
 assert.match(partnerPortalJs,/await cavoRequest\(get\('cavo-kind'\),payload\)/);
});
