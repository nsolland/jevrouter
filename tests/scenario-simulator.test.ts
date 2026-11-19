import test from "node:test";
import assert from "node:assert/strict";
import { simulateScenarios } from "../src/scenario-simulator.js";
import { compileScenarios, decideCompiled } from "../src/intelligence-compilation.js";

test("offline simulation is reproducible and separates held-out trials",()=>{
  const spec={states:["clear","blocked"],actions:["scan","wait"],trialsPerAction:10,seed:42};
  const world=({state,action,random}:{state:string;action:string;random:()=>number})=>
    ({reward:(state==="clear" && action==="scan"?1:0.1)+random()*0.01,safe:!(state==="blocked"&&action==="scan")});
  const a=simulateScenarios(spec,world);
  assert.deepEqual(a,simulateScenarios(spec,world));
  assert.equal(a.length,40);
  assert.equal(a.filter(x=>x.partition==="holdout").length,8);
  const policy=compileScenarios(a);
  assert.equal(decideCompiled(policy,"clear",["scan","wait"]).action,"scan");
  assert.equal(decideCompiled(policy,"blocked",["scan","wait"]).action,"wait");
});
test("simulation refuses invalid/oversized specifications and invalid world output",()=>{
  assert.throws(()=>simulateScenarios({states:["a"],actions:["b"],trialsPerAction:1,seed:1},()=>({reward:0,safe:true})),/invalid simulation spec/);
  assert.throws(()=>simulateScenarios({states:["a"],actions:["b"],trialsPerAction:3,seed:1},()=>({reward:NaN,safe:true})),/invalid world model/);
});
