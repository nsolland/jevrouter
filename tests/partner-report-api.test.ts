import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PartnerRegistry} from '../src/partner-registry.js';
import {createPartnerReportApi} from '../src/partner-report-api.js';
test('partner branded report HTTP endpoint isolates customers and excludes secrets',async()=>{
 const file=join(await mkdtemp(join(tmpdir(),'report-api-')),'registry.json');
 const r=new PartnerRegistry(file),token='a'.repeat(48),other='b'.repeat(48);
 const brand=(partnerId:string)=>({partnerId,productName:'Partner Intelligence',
 supportEmail:'help@example.org',domain:'example.org',legalEntity:'Partner Ltd'});
 await r.provision(brand('p'),token);await r.provision(brand('q'),other);
 await r.addCustomer('p',token,{partnerId:'p',customerId:'c',
 displayName:'Customer C',enabled:true,allowedDomains:[]});
 const server=createPartnerReportApi(r,async(p,c)=>({
  id:'fixture',async readUsage(){return [{id:'u1',partnerId:p,customerId:c,
   source:'fixture',provider:'openai',model:'m',workflow:'w',
   occurredAt:'2026-11-01T12:00:00Z',amountMinor:100,currency:'USD'}];},
  async readInvoices(){return [{id:'i1',partnerId:p,customerId:c,source:'fixture',
   provider:'openai',periodStart:'2026-11-01',periodEnd:'2026-11-01',
   amountMinor:100,currency:'USD'}];}
 }));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const addr=server.address();
  if(!addr||typeof addr==='string')throw Error('no_port');
  const url='http://127.0.0.1:'+addr.port+'/reports/c?from=2026-11-01&to=2026-11-30&currency=USD';
  const headers=(p:string,t:string)=>({'x-partner-id':p,authorization:'Bearer '+t});
  const response=await fetch(url,{headers:headers('p',token)});
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.equal(payload.product,'Partner Intelligence');
  assert.equal(payload.report.spend.usageMinor,100);
  assert.equal(payload.report.roi.status,'NOT_ESTABLISHED');
  assert.equal(JSON.stringify(payload).includes(token),false);
  assert.equal((await fetch(url,{headers:headers('q',other)})).status,404);
  assert.equal((await fetch(url,{headers:headers('p','bad')})).status,401);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
