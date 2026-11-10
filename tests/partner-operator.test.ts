import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PartnerRegistry} from '../src/partner-registry.js';
import {provisionPartnerFromEnv,startPartnerServiceFromEnv} from '../src/partner-operator.js';
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
