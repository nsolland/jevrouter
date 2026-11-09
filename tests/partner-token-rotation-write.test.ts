import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PartnerRegistry} from '../src/partner-registry.js';
test('rotated partner token cannot authorize customer writes after rotation',async()=>{
 const file=join(await mkdtemp(join(tmpdir(),'rotation-race-')),'registry.json');
 const r=new PartnerRegistry(file);
 const old='o'.repeat(48),next='n'.repeat(48);
 await r.provision({partnerId:'p',productName:'Brand',supportEmail:'ops@example.org',
 domain:'example.org',legalEntity:'Brand AS'},old);
 await r.rotateToken('p',old,next);
 const customer={partnerId:'p',customerId:'c',displayName:'Customer',
 enabled:true,allowedDomains:[]};
 await assert.rejects(r.addCustomer('p',old,customer),/partner_auth_denied/);
 await r.addCustomer('p',next,customer);
 const found=await r.customer('p',next,'c');
 assert.equal(found.customer.customerId,'c');
});
