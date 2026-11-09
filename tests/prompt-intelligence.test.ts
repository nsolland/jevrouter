import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePromptEvent,buildPromptPortfolio} from '../src/prompt-intelligence.js';
const e={eventId:'e1',tenantId:'t1',actorId:'u1',sessionId:'s1',
 timestamp:'2026-11-09T18:00:00Z',promptDigest:'sha256:abc',purpose:'research',
 useCase:'supplier-review',provider:'anthropic',model:'claude',
 inputTokens:100,outputTokens:50,costMinor:123,currency:'NOK'};
test('prompt intent remains unverified without outcome',()=>{
 const r=analyzePromptEvent(e,'t1');
 assert.equal(r.classification,'UNVERIFIED_INTENT');
 assert.ok(r.flags.includes('roi_not_established'));
});
test('linked outcome is not declared causal ROI',()=>{
 const r=buildPromptPortfolio([{...e,resultRef:'output-1',outcomeRef:'crm-1'}],'t1');
 assert.equal(r.findings[0].classification,'OUTCOME_LINKED');
 assert.match(r.disclaimer,/not proof/);
});
test('cross tenant, duplicate and invalid costs rejected',()=>{
 assert.throws(()=>analyzePromptEvent(e,'t2'));
 assert.throws(()=>buildPromptPortfolio([e,e],'t1'));
 assert.throws(()=>analyzePromptEvent({...e,costMinor:-1},'t1'));
});
