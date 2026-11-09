import test from 'node:test';
import assert from 'node:assert/strict';
import {planPrompt} from '../src/pre-prompt-intelligence.js';
const base={tenantId:'t1',actorId:'u1',originalPrompt:'Analyze supplier spend',
 purpose:'supplier review',dataClass:'internal' as const,maxCostMinor:1000,
 requiresAction:false,approvedModels:['model-a','model-b']};
test('preserves original and creates non-authorizing plan',()=>{
 const r=planPrompt(base);
 assert.equal(r.intent,'analysis'); assert.equal(r.originalPrompt,base.originalPrompt);
 assert.equal(r.executionAuthorized,false);
 assert.deepEqual(r.routingCandidates,['model-a','model-b']);
});
test('action and restricted data fail to silent execution or external routing',()=>{
 assert.equal(planPrompt({...base,requiresAction:true}).needsClarification,true);
 assert.deepEqual(planPrompt({...base,dataClass:'restricted'}).routingCandidates,[]);
 assert.deepEqual(planPrompt({...base,maxCostMinor:0}).routingCandidates,[]);
});
test('ambiguous prompts require clarification',()=>{
 assert.equal(planPrompt({...base,originalPrompt:'hello'}).needsClarification,true);
 assert.equal(planPrompt({...base,originalPrompt:'analyze and write'}).needsClarification,true);
});
