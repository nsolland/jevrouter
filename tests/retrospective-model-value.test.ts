import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeRetrospectiveModelValue,type CallObservation,type AlternativeEvidence} from '../src/retrospective-model-value.js';
const c:CallObservation={tenantId:'tenant-a',callId:'c1',actorId:'alice',taskId:'t1',taskClass:'summarize',difficulty:'simple',
 modelId:'premium',costMicros:200,currency:'USD',costOrigin:'metered_estimate',occurredAt:'2026-11-18T09:00:00Z',
 outcome:'ACCEPTED',outcomeIndependentlyVerified:true,capabilities:['text'],evidenceRef:'receipt1'};
const a:AlternativeEvidence={tenantId:'tenant-a',modelId:'economy',taskClass:'summarize',difficulty:'simple',
 capabilities:['text'],sampleCount:20,verifiedAcceptedCount:19,qualityLowerBound:.91,meanCostMicros:20,
 currency:'USD',independentlyVerified:true,evidenceRef:'benchmark1'};
const policy={minEvidenceSamples:10,minAcceptedRate:.9,minimumQualityLowerBound:.85};
const run=(calls:CallObservation[],alts:AlternativeEvidence[]=[])=>analyzeRetrospectiveModelValue({tenantId:'tenant-a',period:'2026-11',currency:'USD',calls,alternatives:alts,policy});
test('matched verified cheaper alternative produces conditional review only',()=>{
 const r=run([c], [a]);
 assert.equal(r.reviewCandidateCalls,1);
 assert.equal(r.totalPotentialSavingsMicros,180);
 assert.equal(r.actors[0].recommendation,'REVIEW_MODEL_CHOICE');
 assert.equal(r.actors[0].costPerVerifiedAcceptedMicros,200);
 assert.equal(r.executionAuthorized,false);
 assert.equal(r.automaticAccessChange,false);
 assert.equal(r.providerCalls,0);
 assert.equal(r.opportunities[0].alternativeEvidenceRef,'benchmark1');
});
test('no attribution, unknown costs and unverified outcome remain unclaimed',()=>{
 const r=run([{...c,callId:'c2',actorId:null,taskId:null,taskClass:null,difficulty:null,costMicros:null,costOrigin:'unknown',outcome:'UNKNOWN',outcomeIndependentlyVerified:false}],[a]);
 assert.equal(r.reviewCandidateCalls,0);
 assert.equal(r.unattributedCalls,1);
 assert.equal(r.unpricedCalls,1);
 assert.equal(r.actors[0].costPerVerifiedAcceptedMicros,null);
});
test('unmatched quality task class, difficulty, capability and no independent evidence block savings',()=>{
 for(const bad of [{...a,taskClass:'coding'}, {...a,difficulty:'complex' as const},{...a,capabilities:['vision']},
 {...a,independentlyVerified:false}, {...a,qualityLowerBound:.6},{...a,sampleCount:2,verifiedAcceptedCount:2},
 {...a,verifiedAcceptedCount:2}, {...a,meanCostMicros:201}])
  assert.equal(run([c],[bad]).reviewCandidateCalls,0);
 assert.equal(run([{...c,outcomeIndependentlyVerified:false}],[a]).reviewCandidateCalls,0);
});
test('cross-tenant, duplicate, period and unproven priced rows fail closed',()=>{
 assert.throws(()=>run([c,{...c}]),/INVALID_CALL_OBSERVATION/);
 assert.throws(()=>run([{...c,tenantId:'tenant-b'}]),/INVALID_CALL_OBSERVATION/);
 assert.throws(()=>run([c],[{...a,tenantId:'tenant-b'}]),/INVALID_ALTERNATIVE_EVIDENCE/);
 assert.throws(()=>run([{...c,occurredAt:'2026-10-18T09:00:00Z'}]),/INVALID_CALL_OBSERVATION/);
 assert.throws(()=>run([{...c,costOrigin:'unknown'}]),/UNSOURCED_COST/);
});

test('observed profiles and platforms enable cost grouping but never identity or value attribution',()=>{
 const r=run([{...c,callId:'c11',actorId:null,taskId:null,taskClass:null,difficulty:null,
   observedProfile:'default',observedPlatform:'cron',observedCronJobId:null, outcome:'UNKNOWN',outcomeIndependentlyVerified:false},
  {...c,callId:'c12',actorId:null,taskId:null,taskClass:null,difficulty:null,
   observedProfile:'default',observedPlatform:'cron',observedCronJobId:null,outcome:'UNKNOWN',outcomeIndependentlyVerified:false},
  {...c,callId:'c13',actorId:null,taskId:null,taskClass:null,difficulty:null,
   observedProfile:null,observedPlatform:'cli',observedCronJobId:null,outcome:'UNKNOWN',outcomeIndependentlyVerified:false}]);
 assert.equal(r.observedOrigins.length,2);
 assert.equal(r.observedOrigins[0].calls,2);
 assert.equal(r.observedOrigins[0].observedPlatform,'cron');
 assert.equal(r.observedOriginAttributionVerified,false);
 assert.equal(r.unattributedCalls,3);
 assert.equal(r.verifiedOutcomes,0);
 assert.equal(r.reviewCandidateCalls,0);
 assert.throws(()=>run([{...c,observedProfile:'../../../secret'}]),/INVALID_OBSERVED_ORIGIN/);
});
