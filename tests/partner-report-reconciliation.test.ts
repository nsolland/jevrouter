import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PartnerRegistry} from '../src/partner-registry.js';
import {createPartnerReportApi} from '../src/partner-report-api.js';
import {composeSpendSources} from '../src/composite-spend-adapter.js';
test('report warns about potential cross-source double counting',async()=>{
 const file=join(await mkdtemp(join(tmpdir(),'reconciliation-')),'registry.json');
 const registry=new PartnerRegistry(file),token='t'.repeat(48);
 await registry.provision({partnerId:'p',productName:'Brand',supportEmail:'a@example.org',
 domain:'example.org',legalEntity:'Brand AS'},token);
 await registry.addCustomer('p',token,{partnerId:'p',customerId:'c',
 displayName:'Customer',enabled:true,allowedDomains:[]});
 const adapter=composeSpendSources({partnerId:'p',customerId:'c',sources:[
 ...['langfuse','litellm'].map(source=>({id:source,
  async readUsage(){return [{id:source,source,partnerId:'p',customerId:'c',
   provider:'openai',model:'m',workflow:'w',occurredAt:'2026-11-01T00:00:00Z',
   amountMinor:100,currency:'USD'}];},
  async readInvoices(){return [];}}))]});
 const server=createPartnerReportApi(registry,async()=>adapter);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const a=server.address();if(!a||typeof a==='string')throw Error('no_port');
  const response=await fetch('http://127.0.0.1:'+a.port+
   '/reports/c?from=2026-11-01&to=2026-11-30&currency=USD',
   {headers:{'x-partner-id':'p',authorization:'Bearer '+token}});
  assert.equal(response.status,200);
  const report=await response.json();
  assert.equal(report.report.spend.usageMinor,200);
  assert.equal(report.reconciliation.status,'POTENTIAL_OVERLAP');
  assert.equal(report.reconciliation.unresolvedSourceRecords,2);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
