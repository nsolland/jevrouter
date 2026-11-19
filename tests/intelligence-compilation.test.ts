import test from "node:test";
import assert from "node:assert/strict";
import { compileScenarios, decideCompiled, evaluateHoldout, type Outcome } from "../src/intelligence-compilation.js";

const rows: Outcome[] = [
  {scenarioId:"t1",state:"clear",action:"scan",reward:0.9,safe:true,partition:"train"},
  {scenarioId:"t2",state:"clear",action:"scan",reward:0.8,safe:true,partition:"train"},
  {scenarioId:"t3",state:"clear",action:"hold",reward:0.2,safe:true,partition:"train"},
  {scenarioId:"t4",state:"clear",action:"hold",reward:0.3,safe:true,partition:"train"},
  {scenarioId:"t5",state:"danger",action:"advance",reward:1,safe:false,partition:"train"},
  {scenarioId:"t6",state:"danger",action:"advance",reward:1,safe:false,partition:"train"},
  {scenarioId:"h1",state:"clear",action:"scan",reward:0.75,safe:true,partition:"holdout"},
  {scenarioId:"h2",state:"unknown",action:"hold",reward:0.1,safe:true,partition:"holdout"},
];
test("compile train scenarios into a deterministic decision artifact",()=>{
  const a=compileScenarios(rows);
  const b=compileScenarios([...rows].reverse());
  assert.deepEqual(a,b);
  assert.equal(a.states.clear.action,"scan");
  assert.equal(a.states.danger,undefined);
  assert.equal(decideCompiled(a,"clear",["scan","hold"]).action,"scan");
});
test("unknown states, unsafe evidence and unavailable winners fail to no_decision",()=>{
  const p=compileScenarios(rows);
  assert.equal(decideCompiled(p,"danger",["advance"]).status,"no_decision");
  assert.equal(decideCompiled(p,"unknown",["scan"]).status,"no_decision");
  assert.equal(decideCompiled(p,"clear",["hold"]).status,"no_decision");
});
test("reject malformed evidence, duplicate ids, and bad candidates",()=>{
  assert.throws(()=>compileScenarios([...rows,rows[0]]),/duplicate/);
  assert.throws(()=>compileScenarios([{...rows[0],reward:NaN}]),/invalid scenario/);
  assert.throws(()=>compileScenarios(rows,{minimumSupport:0}),/threshold/);
  assert.throws(()=>decideCompiled(compileScenarios(rows),"clear",["scan","scan"]),/invalid candidates/);
});
test("holdout does not contaminate compiled policy and reports abstentions",()=>{
  const policy=compileScenarios(rows);
  assert.deepEqual(policy,compileScenarios(rows.filter(r=>r.partition==="train")));
  const result=evaluateHoldout(policy,rows);
  assert.deepEqual(result,{evaluated:1,abstained:1,accuracy:1,meanReward:0.75});
});
test("ambiguous rewards abstain rather than invent certainty",()=>{
  const p=compileScenarios([
    {scenarioId:"a",state:"tie",action:"left",reward:1,safe:true,partition:"train"},
    {scenarioId:"b",state:"tie",action:"right",reward:1,safe:true,partition:"train"}
  ],{minimumSupport:1});
  assert.equal(decideCompiled(p,"tie",["left","right"]).status,"no_decision");
});
