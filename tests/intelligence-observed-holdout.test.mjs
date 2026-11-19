import test from "node:test";
import assert from "node:assert/strict";
import {compileScenarios,evaluateObservedHoldout} from "../dist/intelligence-compilation.js";
const train=[
 {scenarioId:"t1",state:"ok",action:"move",reward:5,safe:true,partition:"train"},
 {scenarioId:"t2",state:"ok",action:"move",reward:4,safe:true,partition:"train"},
 {scenarioId:"t3",state:"ok",action:"wait",reward:0,safe:true,partition:"train"},
 {scenarioId:"t4",state:"ok",action:"wait",reward:1,safe:true,partition:"train"}
];
test("observed reward excludes unchosen actions and counts uncovered states",()=>{
 const p=compileScenarios(train);
 const rows=[
 {scenarioId:"h1",state:"ok",action:"move",reward:3,safe:true,partition:"holdout"},
 {scenarioId:"h2",state:"ok",action:"wait",reward:100,safe:true,partition:"holdout"},
 {scenarioId:"h3",state:"new",action:"move",reward:10,safe:true,partition:"holdout"},
 {scenarioId:"h4",state:"ok",action:"move",reward:-9,safe:false,partition:"holdout"}
 ];
 assert.deepEqual(evaluateObservedHoldout(p,rows),{
  observations:4,matched:2,unmatched:1,abstained:1,observedMeanReward:-3,observedUnsafeRate:0.5
 });
});
test("no matching observed action does not manufacture reward",()=>{
 const p=compileScenarios(train);
 const x=evaluateObservedHoldout(p,[{scenarioId:"h",state:"ok",action:"wait",reward:20,safe:true,partition:"holdout"}]);
 assert.equal(x.matched,0);assert.equal(x.observedMeanReward,null);
});