import test from 'node:test';
import assert from 'node:assert/strict';
import {importPromptfooMatchedEvaluation} from '../src/promptfoo-evaluation-import.js';
const digest='sha256:'+'a'.repeat(64);
const baseline={id:'t1',variant:'baseline' as const,model:'a',costMinor:20,
 latencyMs:100,reviewMinutes:5,qualityScore:0.8,accepted:true,
 prompt:'private prompt',output:'private output'};
test('Promptfoo metrics exclude raw prompt and response',()=>{
 const r=importPromptfooMatchedEvaluation({partnerId:'p',customerId:'c',
 sourceDigest:digest,rows:[baseline,{...baseline,variant:'candidate',
 costMinor:10,reviewMinutes:2,qualityScore:0.9}]});
 assert.equal(r.matchedCount,1);
 assert.equal(r.costPerAcceptedTaskMinor.baseline,20);
 assert.equal(r.costPerAcceptedTaskMinor.candidate,10);
 assert.equal(JSON.stringify(r).includes('private'),false);
 assert.equal(r.causalStatus,'NOT_ESTABLISHED');
});
test('Promptfoo requires source provenance',()=>{
 assert.throws(()=>importPromptfooMatchedEvaluation({partnerId:'p',
 customerId:'c',sourceDigest:'unknown',rows:[]}),/invalid_promptfoo_provenance/);
});
