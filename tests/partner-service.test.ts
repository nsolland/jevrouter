import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PartnerRegistry} from '../src/partner-registry.js';
import {createConfiguredPartnerService,listenPartnerService} from '../src/partner-service.js';
test('configured service runs scoped read-only invoice report and forbids public bind',async()=>{
 const file=join(await mkdtemp(join(tmpdir(),'service-')),'registry.json');
 const r=new PartnerRegistry(file),token='z'.repeat(48);
 await r.provision({partnerId:'p',productName:'Brand AI',
 supportEmail:'a@example.org',domain:'example.org',legalEntity:'Brand AS'},token);
 await r.addCustomer('p',token,{partnerId:'p',customerId:'c',
 displayName:'Customer',enabled:true,allowedDomains:[]});
 const server=createConfiguredPartnerService({registryFile:file,partnerId:'p',customerId:'c',
 invoices:{id:'invoice',async readUsage(){return []},async readInvoices(){
 return [{id:'i',partnerId:'p',customerId:'c',source:'fixture',
 provider:'provider',periodStart:'2026-11-01',periodEnd:'2026-11-30',
 amountMinor:450,currency:'USD'}]}}});
 await assert.rejects(listenPartnerService(server,0,'0.0.0.0'),/public_bind_forbidden/);
 const address=await listenPartnerService(server,0);
 try{
  if(!address||typeof address==='string')throw Error('missing_port');
  const url='http://127.0.0.1:'+address.port+
   '/reports/c?from=2026-11-01&to=2026-11-30&currency=USD';
  const response=await fetch(url,{headers:{'x-partner-id':'p',
   authorization:'Bearer '+token}});
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.product,'Brand AI');
  assert.equal(data.report.spend.invoiceMinor,450);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
