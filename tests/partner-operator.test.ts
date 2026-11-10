import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PartnerRegistry} from '../src/partner-registry.js';
import {configurePartnerSourceFromEnv,provisionPartnerFromEnv,startPartnerServiceFromEnv} from '../src/partner-operator.js';
test('operator provisions partner and rejects public service binding',async()=>{
 const file=join(await mkdtemp(join(tmpdir(),'partner-operator-')),'registry.json');
 const env={SPEND_REGISTRY_FILE:file,SPEND_PARTNER_ID:'partner',
 SPEND_BRAND_NAME:'White Label',SPEND_SUPPORT_EMAIL:'ops@example.org',
 SPEND_BRAND_DOMAIN:'spend.example.org',SPEND_LEGAL_ENTITY:'Partner AS'};
 const result=await provisionPartnerFromEnv(env);
 assert.equal(result.token.length,64);
 const registry=new PartnerRegistry(file);
 assert.equal((await registry.authenticate('partner',result.token)).partnerId,'partner');
 await assert.rejects(startPartnerServiceFromEnv({...env,SPEND_CUSTOMER_ID:'customer'}),
 /invalid_service_configuration/);
});

test('operator launches multi-partner white-label runtime from protected config',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'partner-multi-env-'));
 const file=join(dir,'tenants.json');
 await writeFile(file,JSON.stringify({tenants:[
  {partnerId:'one',customerId:'a',litellm:{baseUrl:'https://one.example',apiKey:'key1',teamId:'t1'}},
  {partnerId:'two',customerId:'b',langfuse:{baseUrl:'https://two.example',publicKey:'pk',secretKey:'sk'}}
 ]}),{mode:0o600});
 const env={SPEND_REGISTRY_FILE:join(dir,'registry.json'),SPEND_TENANTS_FILE:file,SPEND_PORT:'0'};
 const {server,address}=await startPartnerServiceFromEnv(env);
 try{assert.ok(address);}
 finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
 await chmod(file,0o644);
 await assert.rejects(startPartnerServiceFromEnv(env),/insecure_tenants_file_permissions/);
});

test('multi-partner config rejects missing credentials and nonlocal cleartext upstream',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'partner-invalid-env-'));
 const file=join(dir,'tenants.json');
 const env={SPEND_REGISTRY_FILE:join(dir,'registry.json'),SPEND_TENANTS_FILE:file};
 for(const litellm of [
  {baseUrl:'https://valid.example',apiKey:'',teamId:'team'},
  {baseUrl:'http://remote.example',apiKey:'secret',teamId:'team'}]){
  await writeFile(file,JSON.stringify({tenants:[{partnerId:'p',customerId:'c',litellm}]}),{mode:0o600});
  await assert.rejects(startPartnerServiceFromEnv(env),/invalid_tenants_configuration/);
 }
});

test('source onboarding is partner-scoped, secret-safe and preserves existing bindings',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'source-onboard-'));
 const registryFile=join(dir,'registry.json'),file=join(dir,'tenants.json');
 const registry=new PartnerRegistry(registryFile);
 for(const id of ['alpha','beta']){
  await registry.provision({partnerId:id,productName:id,domain:id+'.example.org',
   supportEmail:'ops@example.org',legalEntity:id},id.repeat(12));
  await registry.addCustomer(id,id.repeat(12),{partnerId:id,customerId:'same',
   displayName:id,enabled:true,allowedDomains:[]});
 }
 const base={SPEND_REGISTRY_FILE:registryFile,SPEND_TENANTS_FILE:file,
  SPEND_PARTNER_ID:'alpha',SPEND_CUSTOMER_ID:'same',SPEND_PARTNER_TOKEN:'alpha'.repeat(12),
  SPEND_SOURCE_URL:'https://langfuse.example',SPEND_SOURCE:'langfuse',
  SPEND_SOURCE_PUBLIC_KEY:'public',SPEND_SOURCE_SECRET_KEY:'secret'};
 const first=await configurePartnerSourceFromEnv(base);
 assert.deepEqual(first,{partnerId:'alpha',customerId:'same',source:'langfuse',
  configured:true,restartRequired:true});
 const second=await configurePartnerSourceFromEnv({...base,SPEND_SOURCE:'litellm',
  SPEND_SOURCE_URL:'https://litellm.example',SPEND_SOURCE_API_KEY:'litellm-secret',
  SPEND_SOURCE_TEAM_ID:'team'});
 assert.equal(second.source,'litellm');
 const saved=JSON.parse(await readFile(file,'utf8'));
 assert.equal(saved.tenants.length,1);
 assert.equal(saved.tenants[0].langfuse.secretKey,'secret');
 assert.equal(saved.tenants[0].litellm.apiKey,'litellm-secret');
 await assert.rejects(configurePartnerSourceFromEnv({...base,SPEND_PARTNER_TOKEN:'beta'.repeat(12)}),
  /partner_auth_denied/);
 await chmod(file,0o644);
 await assert.rejects(configurePartnerSourceFromEnv(base),/insecure_tenants_file_permissions/);
});
