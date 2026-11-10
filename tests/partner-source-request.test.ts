import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PartnerRegistry} from '../src/partner-registry.js';
import {createPartnerReportApi} from '../src/partner-report-api.js';
test('partner requests sources without exposing credentials or other tenants',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'source-request-'));
 const registry=new PartnerRegistry(join(dir,'registry.json'));
 for(const id of ['alpha','beta']){
  const token=id.repeat(12);
  await registry.provision({partnerId:id,productName:id,domain:id+'.example.org',
   supportEmail:'ops@example.org',legalEntity:id},token);
  await registry.addCustomer(id,token,{partnerId:id,customerId:'same',
   displayName:id,enabled:true,allowedDomains:[]});
 }
 const server=createPartnerReportApi(registry,async()=>{throw Error('unused');},undefined,
  undefined,join(dir,'requests'));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const address=server.address();if(!address||typeof address==='string')throw Error('no_port');
  const url='http://127.0.0.1:'+address.port+'/customers/same/source-requests';
  const headers={'x-partner-id':'alpha',authorization:'Bearer '+'alpha'.repeat(12),
   'content-type':'application/json'};
  const post=async(payload:unknown)=>fetch(url,{method:'POST',headers,body:JSON.stringify(payload)});
  assert.equal((await post({source:'litellm',baseUrl:'https://spend.example.org',apiKey:'secret'})).status,400);
  assert.equal((await post({source:'litellm',baseUrl:'http://remote.example.org'})).status,400);
  const result=await post({source:'litellm',baseUrl:'https://spend.example.org'});
  assert.equal(result.status,202);
  const list=await fetch(url,{headers});
  const data=await list.json();assert.equal(data.requests.length,1);
  assert.equal(data.requests[0].status,'PENDING_OPERATOR');
  assert.equal(JSON.stringify(data).includes('secret'),false);
  const other=await fetch(url,{headers:{'x-partner-id':'beta',authorization:'Bearer '+'beta'.repeat(12)}});
  assert.deepEqual((await other.json()).requests,[]);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
