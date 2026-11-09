import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PartnerRegistry} from '../src/partner-registry.js';
test('persistent partner credentials and customers survive reload and isolate tenants',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'partner-registry-')),file=join(dir,'registry.json');
 const store=new PartnerRegistry(file),token='p'.repeat(48),other='q'.repeat(48);
 const brand=(partnerId:string)=>({partnerId,productName:'Branded AI',
  supportEmail:'support@example.org',domain:'ai.example.org',legalEntity:'Integrator AS'});
 await store.provision(brand('p'),token);await store.provision(brand('other'),other);
 await store.addCustomer('p',token,{partnerId:'p',customerId:'customer-a',
  displayName:'Customer A',enabled:true,allowedDomains:[]});
 const reloaded=new PartnerRegistry(file);
 assert.equal((await reloaded.customer('p',token,'customer-a')).brand.productName,'Branded AI');
 await assert.rejects(reloaded.customer('other',other,'customer-a'),/customer_scope_denied/);
 await assert.rejects(reloaded.customer('p','wrong','customer-a'),/partner_auth_denied/);
 const raw=await readFile(file,'utf8');
 assert.equal(raw.includes(token),false);
 assert.equal((await stat(file)).mode&0o777,0o600);
});
