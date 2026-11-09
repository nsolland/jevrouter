import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
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
