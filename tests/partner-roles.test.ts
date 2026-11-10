import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PartnerRegistry} from '../src/partner-registry.js';
import {createPartnerControlApi} from '../src/partner-control-api.js';
import {configurePartnerSourceFromEnv} from '../src/partner-operator.js';
test('operator can read scoped customers but cannot administer or rotate owner access',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'partner-rbac-'));
 const file=join(dir,'registry.json'),registry=new PartnerRegistry(file);
 const owner='o'.repeat(48),operator='p'.repeat(48);
 await registry.provision({partnerId:'p',productName:'Partner',domain:'p.example.org',
  supportEmail:'ops@example.org',legalEntity:'Partner'},owner);
 await registry.addCustomer('p',owner,{partnerId:'p',customerId:'c',displayName:'C',
  enabled:true,allowedDomains:[]});
 await registry.issueOperator('p',owner,operator);
 assert.equal((await registry.authenticate('p',operator)).role,'operator');
 await assert.rejects(registry.issueOperator('p',operator,'q'.repeat(48)),/role_forbidden/);
 await assert.rejects(registry.rotateToken('p',operator,'q'.repeat(48)),/role_forbidden/);
 await assert.rejects(registry.addCustomer('p',operator,{partnerId:'p',customerId:'new',
  displayName:'New',enabled:true,allowedDomains:[]}),/role_forbidden/);
 await assert.rejects(configurePartnerSourceFromEnv({SPEND_REGISTRY_FILE:file,
  SPEND_PARTNER_ID:'p',SPEND_CUSTOMER_ID:'c',SPEND_PARTNER_TOKEN:operator,
  SPEND_TENANTS_FILE:join(dir,'tenants.json'),SPEND_SOURCE:'litellm',
  SPEND_SOURCE_URL:'https://provider.example.org',SPEND_SOURCE_API_KEY:'key',
  SPEND_SOURCE_TEAM_ID:'team'}),/role_forbidden/);
 const server=createPartnerControlApi(registry);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const a=server.address();if(!a||typeof a==='string')throw Error('missing_address');
  const base='http://127.0.0.1:'+a.port;
  const headers={'x-partner-id':'p',authorization:'Bearer '+operator};
  assert.equal((await fetch(base+'/customers/c',{headers})).status,200);
  const result=await fetch(base+'/customers',{method:'POST',headers:{...headers,
   'content-type':'application/json'},body:JSON.stringify({customerId:'new',displayName:'New',
    enabled:true,allowedDomains:[]})});
  assert.equal(result.status,403);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
