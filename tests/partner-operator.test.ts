import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,readFile,mkdir,utimes} from 'node:fs/promises';
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

test('parallel source onboarding preserves every tenant binding',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'parallel-source-'));
 const registryFile=join(dir,'registry.json'),file=join(dir,'tenants.json');
 const registry=new PartnerRegistry(registryFile);
 const token='x'.repeat(48);
 await registry.provision({partnerId:'partner',productName:'Partner',domain:'partner.example.org',
  supportEmail:'ops@example.org',legalEntity:'Partner AS'},token);
 for(let i=0;i<12;i++)await registry.addCustomer('partner',token,{partnerId:'partner',
  customerId:'client'+i,displayName:'Client '+i,enabled:true,allowedDomains:[]});
 const results=await Promise.all(Array.from({length:12},(_,i)=>configurePartnerSourceFromEnv({
  SPEND_REGISTRY_FILE:registryFile,SPEND_TENANTS_FILE:file,SPEND_PARTNER_ID:'partner',
  SPEND_PARTNER_TOKEN:token,SPEND_CUSTOMER_ID:'client'+i,SPEND_SOURCE:'litellm',
  SPEND_SOURCE_URL:'https://upstream.example.org',SPEND_SOURCE_API_KEY:'key-'+i,
  SPEND_SOURCE_TEAM_ID:'team-'+i})));
 assert.equal(results.length,12);
 const data=JSON.parse(await readFile(file,'utf8'));
 assert.equal(data.tenants.length,12);
 assert.deepEqual(data.tenants.map((t:{customerId:string})=>t.customerId).sort(),
  Array.from({length:12},(_,i)=>'client'+i).sort());
});

test('dead-owner tenant lock is recovered without losing config',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'stale-source-'));
 const registryFile=join(dir,'registry.json'),file=join(dir,'tenants.json');
 const registry=new PartnerRegistry(registryFile),token='a'.repeat(48);
 await registry.provision({partnerId:'p',productName:'P',domain:'p.example.org',
  supportEmail:'ops@example.org',legalEntity:'P'},token);
 await registry.addCustomer('p',token,{partnerId:'p',customerId:'c',displayName:'C',
  enabled:true,allowedDomains:[]});
 const lock=file+'.lock';await mkdir(lock,{mode:0o700});
 await writeFile(lock+'/owner.json',JSON.stringify({pid:2147483647,createdAt:1}),{mode:0o600});
 const old=new Date(Date.now()-12000);await utimes(lock,old,old);
 const result=await configurePartnerSourceFromEnv({SPEND_REGISTRY_FILE:registryFile,
  SPEND_TENANTS_FILE:file,SPEND_PARTNER_ID:'p',SPEND_PARTNER_TOKEN:token,
  SPEND_CUSTOMER_ID:'c',SPEND_SOURCE:'litellm',
  SPEND_SOURCE_URL:'https://provider.example.org',SPEND_SOURCE_API_KEY:'key',
  SPEND_SOURCE_TEAM_ID:'team'});
 assert.equal(result.configured,true);
 assert.equal(JSON.parse(await readFile(file,'utf8')).tenants.length,1);
});
