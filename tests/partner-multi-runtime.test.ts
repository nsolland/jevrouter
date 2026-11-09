import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PartnerRegistry} from '../src/partner-registry.js';
import {createMultiPartnerService,listenPartnerService} from '../src/partner-service.js';
test('two independently branded partners and three customers share runtime without leaking',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'multi-spend-'));
 const registryFile=join(dir,'registry.json'),historyFile=join(dir,'history.json');
 const registry=new PartnerRegistry(registryFile);
 const tokens={alpha:'a'.repeat(48),beta:'b'.repeat(48)};
 for(const partnerId of ['alpha','beta'] as const){
  await registry.provision({partnerId,productName:partnerId+' Spend',
   supportEmail:'ops@example.org',domain:partnerId+'.example.org',
   legalEntity:partnerId+' AS'},tokens[partnerId]);
 }
 for(const [partnerId,customerId] of [['alpha','shared'],['alpha','second'],['beta','shared']] as const){
  await registry.addCustomer(partnerId,tokens[partnerId],{partnerId,customerId,
   displayName:customerId,enabled:true,allowedDomains:[]});
 }
 const calls:string[]=[];
 const tenants=[['alpha','shared',110],['alpha','second',220],['beta','shared',330]] as const;
 const server=createMultiPartnerService({registryFile,historyFile,tenants:tenants.map(
  ([partnerId,customerId,amountMinor])=>({partnerId,customerId,
   invoices:{id:'tenant-invoice',async readUsage(p:string,c:string){
    assert.equal(p,partnerId);assert.equal(c,customerId);return [];},
    async readInvoices(p:string,c:string){calls.push(partnerId+'/'+customerId);
     assert.equal(p,partnerId);assert.equal(c,customerId);
     return [{id:'invoice',partnerId,customerId,source:'test',
      provider:'test',periodStart:'2026-11-01',periodEnd:'2026-11-30',
      amountMinor,currency:'USD'}];}}}))});
 const addr=await listenPartnerService(server,0);
 if(!addr||typeof addr==='string')throw Error('missing_port');
 const base='http://127.0.0.1:'+addr.port;
 try{
  for(const [partnerId,customerId,amountMinor] of tenants){
   const headers={'x-partner-id':partnerId,authorization:'Bearer '+tokens[partnerId as 'alpha'|'beta']};
   const response=await fetch(base+'/reports/'+customerId+
    '?from=2026-11-01&to=2026-11-30&currency=USD',{headers});
   assert.equal(response.status,200);
   const result=await response.json();
   assert.equal(result.product,partnerId+' Spend');
   assert.equal(result.report.spend.invoiceMinor,amountMinor);
   const history=await fetch(base+'/reports/'+customerId+'/history',{headers});
   assert.equal((await history.json()).snapshots.length,1);
  }
  assert.deepEqual(calls,['alpha/shared','alpha/second','beta/shared']);
  const wrong=await fetch(base+'/reports/second/history',{headers:{
   'x-partner-id':'beta',authorization:'Bearer '+tokens.beta}});
  assert.equal(wrong.status,404);
  const cross=await fetch(base+'/reports/shared/history',{headers:{
   'x-partner-id':'alpha',authorization:'Bearer '+tokens.beta}});
  assert.equal(cross.status,401);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
