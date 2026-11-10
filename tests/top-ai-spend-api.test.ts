import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PartnerRegistry} from '../src/partner-registry.js';
import {createPartnerReportApi} from '../src/partner-report-api.js';
test('top spend endpoint fails closed without attribution and enforces tenant scope',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'topscan-api-'));
 const registry=new PartnerRegistry(join(dir,'registry.json'));
 const token='t'.repeat(48);
 await registry.provision({partnerId:'partner',productName:'Brand',domain:'brand.example.org',
  supportEmail:'ops@example.org',legalEntity:'Partner'},token);
 await registry.addCustomer('partner',token,{partnerId:'partner',customerId:'customer',
  displayName:'Customer',enabled:true,allowedDomains:[]});
 const adapter=async()=>{throw Error('not_used');};
 const server=createPartnerReportApi(registry,adapter);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const addr=server.address();if(!addr||typeof addr==='string')throw Error('missing_port');
  const base='http://127.0.0.1:'+addr.port;
  const url='/customers/customer/top-spend?from=2026-11-01&to=2026-11-30&currency=NOK';
  assert.equal((await fetch(base+url)).status,401);
  const headers={'x-partner-id':'partner',authorization:'Bearer '+token};
  assert.equal((await fetch(base+'/customers/other/top-spend?from=2026-11-01&to=2026-11-30&currency=NOK',
   {headers})).status,404);
  const response=await fetch(base+url,{headers});
  assert.equal(response.status,422);
  assert.equal((await response.json()).error,'actor_attribution_not_configured');
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
