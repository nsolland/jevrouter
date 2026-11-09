import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PartnerRegistry} from '../src/partner-registry.js';
test('concurrent registrations persist and rotation revokes previous token',async()=>{
 const file=join(await mkdtemp(join(tmpdir(),'partner-race-')),'store.json');
 const registry=new PartnerRegistry(file),token='a'.repeat(48),next='b'.repeat(48);
 await registry.provision({partnerId:'p',productName:'AI',supportEmail:'a@example.org',
 domain:'a.example.org',legalEntity:'P'},token);
 await Promise.all(Array.from({length:12},(_,i)=>
  new PartnerRegistry(file).addCustomer('p',token,{partnerId:'p',
   customerId:'c'+i,displayName:'Customer '+i,enabled:true,allowedDomains:[]})));
 const restored=new PartnerRegistry(file);
 for(let i=0;i<12;i++)assert.equal((await restored.customer('p',token,'c'+i)).customer.customerId,'c'+i);
 await restored.rotateToken('p',token,next);
 await assert.rejects(restored.authenticate('p',token),/partner_auth_denied/);
 assert.equal((await restored.authenticate('p',next)).partnerId,'p');
});
