import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PartnerRegistry} from '../src/partner-registry.js';
import {createPartnerReportApi} from '../src/partner-report-api.js';
test('one partner service handles customer administration and reports',async()=>{
 const file=join(await mkdtemp(join(tmpdir(),'unified-partner-')),'registry.json');
 const registry=new PartnerRegistry(file),token='z'.repeat(48);
 await registry.provision({partnerId:'p',productName:'Brand',supportEmail:'ops@example.org',
 domain:'example.org',legalEntity:'Brand AS'},token);
 const server=createPartnerReportApi(registry,async()=>({
  id:'test',async readUsage(){return [];},async readInvoices(){return [];}}));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const addr=server.address();if(!addr||typeof addr==='string')throw Error('missing_port');
  const base='http://127.0.0.1:'+addr.port;
  const headers={'x-partner-id':'p',authorization:'Bearer '+token};
  const health=await fetch(base+'/health');assert.equal(health.status,200);
  const created=await fetch(base+'/customers',{method:'POST',
   headers:{...headers,'content-type':'application/json'},
   body:JSON.stringify({customerId:'c',displayName:'Customer',enabled:true,allowedDomains:[]})});
  assert.equal(created.status,201);
  const customer=await fetch(base+'/customers/c',{headers});
  assert.equal(customer.status,200);
  const report=await fetch(base+'/reports/c?from=2026-11-01&to=2026-11-30&currency=USD',
   {headers});
  assert.equal(report.status,200);
  const payload=await report.json();
  assert.equal(payload.product,'Brand');
  const forbidden=await fetch(base+'/customers/c',
   {headers:{...headers,authorization:'Bearer wrong'}});
  assert.equal(forbidden.status,401);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
