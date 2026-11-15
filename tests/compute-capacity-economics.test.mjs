import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compareScoutWorkload} from '../scripts/capacity-scout-adapter.mjs';
import '../scripts/capacity-economics.test.mjs';
function scenario(){
 const now='2026-11-13T12:00:00Z';
 const results=[{source:'openrouter',status:'ok',records:1},{source:'vast',status:'ok',records:1}];
 const observations=[{source:'openrouter',reference:'model/a',kind:'model_catalog',priceUsdPerMillionInputTokens:1,priceUsdPerMillionOutputTokens:3},
 {source:'vast',reference:'offer/1',kind:'gpu_offer',capacityBasis:'offer_quantity',availableGpus:1,availability:true,priceUsdPerGpuHour:1}];
 const snapshot={version:1,kind:'market_observations_not_calibrated_capacity',mode:'read_only',observedAt:now,sources:results,observations,
 digest:createHash('sha256').update(JSON.stringify({now,results,observations})).digest('hex')};
 const workload={evidenceKind:'independently_measured',evidenceId:'batch-1',sampleSize:50,
  monthlyAcceptedTasks:1000,inputTokensPerAttempt:800,outputTokensPerAttempt:200,minAcceptanceRate:.8,maxLatencyMs:10000,
  api:{source:'openrouter',reference:'model/a',acceptanceRate:.95,p95LatencyMs:1000,outcomeEvidenceId:'api-test'},
  reserved:{source:'vast',reference:'offer/1',gpuCount:1,billableHours:100,measuredTokensPerSecondPerGpu:100,
    utilization:.5,acceptanceRate:.9,p95LatencyMs:1000,throughputEvidenceId:'gpu-throughput',outcomeEvidenceId:'gpu-test'}};
 return {snapshot,workload};
}
const redigest = snapshot=>createHash('sha256').update(JSON.stringify({now:snapshot.observedAt,results:snapshot.sources,observations:snapshot.observations})).digest('hex');
test('scout listing plus measured task outcomes produce qualified comparison',()=>{
 const {snapshot,workload}=scenario();const r=compareScoutWorkload(snapshot,workload);
 assert.equal(r.status,'estimate');assert.equal(r.authority,'analysis_only');assert.equal(r.recommended,'api');
 assert.ok(Math.abs(r.options[0].costUsd-1000/0.95/1e6*(800*1+200*3))<1e-10);
});
test('reject mutated digest',()=>{const {snapshot,workload}=scenario();snapshot.observations[0].priceUsdPerMillionInputTokens=999;assert.equal(compareScoutWorkload(snapshot,workload).reason,'scout_digest_mismatch')});
test('reject fabricated benchmark label',()=>{const {snapshot,workload}=scenario();workload.evidenceKind='scenario';assert.equal(compareScoutWorkload(snapshot,workload).reason,'missing_independent_workload_benchmark')});
test('reject failed supplier',()=>{const {snapshot,workload}=scenario();snapshot.sources[1].status='unauthorized';snapshot.digest=redigest(snapshot);assert.equal(compareScoutWorkload(snapshot,workload).reason,'missing_healthy_exact_price_listing')});
test('reject unconfirmed availability',()=>{const {snapshot,workload}=scenario();snapshot.observations[1].availability=null;snapshot.digest=redigest(snapshot);assert.equal(compareScoutWorkload(snapshot,workload).reason,'gpu_inventory_not_confirmed')});
test('reject missing throughput evidence',()=>{const {snapshot,workload}=scenario();delete workload.reserved.throughputEvidenceId;assert.equal(compareScoutWorkload(snapshot,workload).reason,'missing_outcome_or_throughput_evidence')});
test('reject insufficient sample',()=>{const {snapshot,workload}=scenario();workload.sampleSize=29;assert.equal(compareScoutWorkload(snapshot,workload).reason,'missing_independent_workload_benchmark')});
