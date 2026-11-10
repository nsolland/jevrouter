import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PartnerRegistry} from '../src/partner-registry.js';
import {createPartnerControlApi} from '../src/partner-control-api.js';
test('partner workspace exposes only own brand and customers',async()=>{
 const registry=new PartnerRegistry(join(await mkdtemp(join(tmpdir(),'partner-workspace-')),'registry.json'));
 const tokens={one:'a'.repeat(48),two:'b'.repeat(48)};
 for(const id of ['one','two'] as const){
  await registry.provision({partnerId:id,productName:id+' Branded Intelligence',
   domain:id+'.example.org',supportEmail:'ops@example.org',legalEntity:id+' AS'},tokens[id]);
  await registry.addCustomer(id,tokens[id],{partnerId:id,customerId:'shared',
   displayName:id+' Customer',enabled:true,allowedDomains:[]});
 }
 const server=createPartnerControlApi(registry);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const address=server.address();if(!address||typeof address==='string')throw Error('missing_address');
  for(const id of ['one','two'] as const){
   const response:Response=await fetch('http://127.0.0.1:'+address.port+'/partner',{headers:{
    'x-partner-id':id,authorization:'Bearer '+tokens[id]}});
   assert.equal(response.status,200);
   const data=await response.json();
   assert.equal(data.brand.productName,id+' Branded Intelligence');
   assert.deepEqual(data.customers.map((c:{partnerId:string})=>c.partnerId),[id]);
   assert.equal(JSON.stringify(data).includes((id==='one'?'two':'one')+' Customer'),false);
   assert.equal(JSON.stringify(data).includes(tokens[id]),false);
  }
  const bad=await fetch('http://127.0.0.1:'+address.port+'/partner',{headers:{
   'x-partner-id':'one',authorization:'Bearer '+tokens.two}});
  assert.equal(bad.status,401);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
