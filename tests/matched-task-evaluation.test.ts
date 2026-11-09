import test from 'node:test';
import assert from 'node:assert/strict';
import {compareMatchedTasks} from '../src/matched-task-evaluation.js';
const base={partnerId:'p',customerId:'c',taskId:'task-1',model:'m',
 latencyMs:100,reviewMinutes:2,qualityScore:.8,accepted:true};
test('matched baseline and candidate track human review and quality',()=>{
 const r=compareMatchedTasks([
 {...base,variant:'baseline',costMinor:100},
 {...base,variant:'candidate',costMinor:60,reviewMinutes:1,qualityScore:.9}
 ],{partnerId:'p',customerId:'c'});
 assert.equal(r.totalCostDeltaMinor,-40);
 assert.equal(r.totalReviewDeltaMinutes,-1);
 assert.ok(Math.abs((r.meanQualityDelta??0)-.1)<1e-10);
 assert.equal(r.causalStatus,'NOT_ESTABLISHED');
});
test('reject cross-customer task measurements',()=>{
 assert.throws(()=>compareMatchedTasks([
 {...base,customerId:'other',variant:'baseline',costMinor:100}
 ],{partnerId:'p',customerId:'c'}),/evaluation_scope_violation/);
});
test('missing matched task does not create invented savings',()=>{
 const r=compareMatchedTasks([{...base,variant:'baseline',costMinor:100}],
 {partnerId:'p',customerId:'c'});
 assert.equal(r.matchedCount,0);
 assert.deepEqual(r.unmatchedTaskIds,['task-1']);
 assert.equal(r.meanQualityDelta,null);
});
