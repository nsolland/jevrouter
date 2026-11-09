import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRouteCandidates} from '../src/evidence-route-evaluation.js';
test('measured accepted-task quality takes precedence over cheapest model',()=>{
 const r=evaluateRouteCandidates([{name:'task',value:'analysis',source:'classifier'}],
 [{model:'cheap',testCaseId:'1',costMinor:1,latencyMs:50,qualityScore:.4,accepted:false},
  {model:'quality',testCaseId:'1',costMinor:8,latencyMs:100,qualityScore:.95,accepted:true}],
 {allowedModels:['cheap','quality'],maxCostMinor:10,minQualityScore:.8,maxLatencyMs:200});
 assert.equal(r.selectedModel,'quality');
 assert.deepEqual(r.ranked.find(x=>x.model==='cheap')?.reasons,['quality_limit']);
});
test('no evaluation yields no eligible model',()=>{
 const r=evaluateRouteCandidates([],[],{allowedModels:['unknown'],
 maxCostMinor:10,minQualityScore:.5,maxLatencyMs:200});
 assert.equal(r.selectedModel,null);
});
