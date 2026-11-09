import test from 'node:test';
import assert from 'node:assert/strict';
import {routeIntelligentPrompt} from '../src/intelligent-prompt-routing.js';
import {JevRouter} from '../src/router.js';
import type {JevProvider,CapabilityManifest} from '../src/types.js';
const input={tenantId:'t1',actorId:'u1',originalPrompt:'Analyze supplier invoices',
 purpose:'spend audit',dataClass:'internal' as const,maxCostMinor:1000,
 requiresAction:false,approvedModels:['m1','m2']};
const candidates:CapabilityManifest[]=['m1','m2'].map(id=>({id,name:id,type:'model',description:id,
 verification:{status:'verified'},availability:{available:true}}));
const benchmarks=['m1','m2'].map((modelId,i)=>({modelId,taskClass:'analysis',
 region:'eu',deploymentMode:'api' as const,acceptedRate:0.9,
 costUsdPerAttempt:i+1,p95LatencyMs:100,sampleSize:50,evidenceId:'bench-'+modelId}));
const provider:JevProvider={name:'stub',async decide(){return {answers:{tool:{
 type:'choice',choice:'m1',probabilities:{m1:0.9,m2:0.1},confidence:0.9
 }}};}};
test('prompt route invokes Jev with measured and approved candidates only',async()=>{
 const r=await routeIntelligentPrompt({input,taskClass:'analysis',minimumQuality:0.8,
 benchmarks,router:new JevRouter(provider),candidates});
 assert.equal(r.status,'routed');
 assert.equal(r.result?.decision.selected,'m1');
 assert.equal(r.result?.execution.enabled,false);
});
test('missing benchmarks and external actions abstain',async()=>{
 const router=new JevRouter(provider);
 assert.equal((await routeIntelligentPrompt({input,taskClass:'analysis',
 minimumQuality:0.8,benchmarks:[],router,candidates})).status,'abstain');
 assert.equal((await routeIntelligentPrompt({input:{...input,requiresAction:true},
 taskClass:'analysis',minimumQuality:0.8,benchmarks,router,candidates})).status,'abstain');
});
