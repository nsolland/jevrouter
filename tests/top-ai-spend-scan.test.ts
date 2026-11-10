import test from 'node:test';
import assert from 'node:assert/strict';
import {scanTopAiSpend} from '../src/top-ai-spend-scan.js';
import type {SpendRecord} from '../src/spend-intelligence.js';
const records:SpendRecord[]=Array.from({length:10},(_,i)=>({
 id:'r'+i,tenantId:'customer',provider:'p',amountMinor:i===0?6500: i===1?500:375,
 currency:'NOK',occurredAt:'2026-11-01T10:00:00Z',actorId:'actor'+i,
 department:'engineering',useCase:'coding',model:'m'}));
const base={partnerId:'partner',tenantId:'customer',currency:'NOK',
 periodStart:'2026-11-01',periodEnd:'2026-11-30',records};
test('top decile scan identifies spend concentration without inventing ROI',()=>{
 const scan=scanTopAiSpend(base);
 assert.equal(scan.population.observedActors,10);
 assert.equal(scan.population.topCount,1);
 assert.equal(scan.topConsumers[0].actorId,'actor0');
 assert.equal(scan.topConsumers[0].valueStatus,'NOT_ESTABLISHED');
 assert.equal(scan.roiStatus,'NOT_CAUSALLY_ESTABLISHED');
 assert.ok(scan.population.topSharePct>60);
 assert.equal(scan.spend.topSpendMinor,6500);
});
test('observed benefit is labeled noncausal and scoped to actor',()=>{
 const scan=scanTopAiSpend({...base,valueEvidence:[{actorId:'actor0',useCase:'coding',
  observedBenefitMinor:12000,baselineMinor:2000,verified:true,sourceId:'outcome1'}]});
 assert.equal(scan.topConsumers[0].observedNetMinor,3500);
 assert.equal(scan.topConsumers[0].valueStatus,'OBSERVED_NOT_CAUSAL');
});
test('scan rejects tenant leaks, missing attribution and duplicate evidence',()=>{
 assert.throws(()=>scanTopAiSpend({...base,records:[{...records[0],tenantId:'other'}]}),/tenant_mismatch/);
 assert.throws(()=>scanTopAiSpend({...base,records:[{...records[0],actorId:''}]}),/missing_actor_attribution/);
 assert.throws(()=>scanTopAiSpend({...base,records:[records[0],records[0]]}),/duplicate_record/);
 assert.throws(()=>scanTopAiSpend({...base,valueEvidence:[{actorId:'unknown',useCase:'coding',
  observedBenefitMinor:1,baselineMinor:0,verified:true,sourceId:'x'}]}),/invalid_value_evidence/);
});
