import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {importPromptfooResultsJson} from '../src/promptfoo-results-json.js';
const sha=(s:string)=>'sha256:'+createHash('sha256').update(s).digest('hex');
test('Promptfoo results JSON imports matched metrics without raw prompts',()=>{
 const rows=['baseline','candidate'].map((variant,i)=>({
 provider:'provider/model',testCase:{vars:{taskId:'task-1',variant,
 secretPrompt:'private prompt'},metadata:{reviewMinutes:i?2:4,
 qualityScore:i?0.9:0.8,accepted:true}},
 response:{cost:i?0.1:0.2,latencyMs:i?90:120,
 output:'private response'},gradingResult:{score:0.8}}));
 const document=JSON.stringify({results:{results:rows}});
 const result=importPromptfooResultsJson({partnerId:'p',customerId:'c',
 document,expectedSha256:sha(document)});
 assert.equal(result.matchedCount,1);
 assert.equal(result.costPerAcceptedTaskMinor.baseline,20);
 assert.equal(result.costPerAcceptedTaskMinor.candidate,10);
 assert.equal(result.causalStatus,'NOT_ESTABLISHED');
 assert.equal(JSON.stringify(result).includes('private'),false);
 assert.throws(()=>importPromptfooResultsJson({partnerId:'p',customerId:'c',
 document,expectedSha256:'sha256:'+'0'.repeat(64)}),/promptfoo_digest_mismatch/);
 const bad=JSON.stringify({results:{results:[{...rows[0],
 testCase:{vars:{taskId:'task-1',variant:'baseline'}}}]}});
 assert.throws(()=>importPromptfooResultsJson({partnerId:'p',customerId:'c',
 document:bad,expectedSha256:sha(bad)}),/incomplete_promptfoo_metrics/);
});
