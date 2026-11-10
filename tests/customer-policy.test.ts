import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {CustomerPolicyStore} from '../src/customer-policy.js';
test('organization must independently approve proposed role and model matrix',async()=>{
 const store=new CustomerPolicyStore(join(await mkdtemp(join(tmpdir(),'policy-')),'policies.json'));
 const rules=[{role:'finance',resource:'invoices',action:'read',model:'approved-model',decision:'ALLOW' as const}];
 const p=await store.propose('integrator','customer',rules,'partner-operator');
 assert.equal((await store.evaluate('integrator','customer','finance','invoices','read','approved-model')).decision,'DENY');
 await assert.rejects(store.decide('integrator','customer',p.id,'APPROVED',
  {id:'partner-operator',organizationVerified:true}),/separation_of_duties_required/);
 await assert.rejects(store.decide('integrator','customer',p.id,'APPROVED',
  {id:'customer-admin',organizationVerified:false}),/organization_approval_required/);
 const approved=await store.decide('integrator','customer',p.id,'APPROVED',
  {id:'customer-admin',organizationVerified:true});
 assert.equal(approved.digest.length,64);
 assert.equal((await store.evaluate('integrator','customer','finance','invoices','read','approved-model')).decision,'ALLOW');
 for(const [role,resource,action,model] of [
  ['finance','invoices','export','approved-model'],['finance','invoices','read','new-model'],
  ['admin','invoices','read','approved-model']]){
  assert.equal((await store.evaluate('integrator','customer',role,resource,action,model)).decision,'DENY');
 }
 assert.equal((await store.evaluate('integrator','other','finance','invoices','read','approved-model')).decision,'DENY');
 const change=await store.propose('integrator','customer',[...rules,
  {role:'finance',resource:'invoices',action:'read',model:'new-model',decision:'ALLOW'}],'partner-operator');
 assert.equal(change.revision,2);
 assert.equal((await store.evaluate('integrator','customer','finance','invoices','read','new-model')).decision,'DENY');
 await store.decide('integrator','customer',change.id,'REJECTED',{id:'customer-admin',organizationVerified:true});
 assert.equal((await store.evaluate('integrator','customer','finance','invoices','read','new-model')).decision,'DENY');
 await assert.rejects(store.decide('integrator','customer',p.id,'APPROVED',
  {id:'customer-admin',organizationVerified:true}),/policy_already_decided/);
});
