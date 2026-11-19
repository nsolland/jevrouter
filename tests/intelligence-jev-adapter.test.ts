import test from "node:test";
import assert from "node:assert/strict";
import { compileScenarios, type Outcome } from "../src/intelligence-compilation.js";
import { requestCompiledJevChoice } from "../src/intelligence-jev-adapter.js";
const evidence: Outcome[] = [
  {scenarioId:"1",state:"visible",action:"inspect",reward:0.9,safe:true,partition:"train"},
  {scenarioId:"2",state:"visible",action:"inspect",reward:0.8,safe:true,partition:"train"},
];
test("Jev receives offline candidates and supplies its own probabilities",async()=>{
 const policy=compileScenarios(evidence);
 let called=0;
 const result=await requestCompiledJevChoice(policy,"visible",["inspect"],async request=>{
   called++;
   assert.equal(request.sourceDigest,policy.sourceDigest);
   assert.equal(request.candidates[0].action,"inspect");
   return {status:"choice",action:"inspect",confidence:0.91,probabilities:{inspect:1}};
 });
 assert.equal(called,1);
 assert.equal(result.status,"choice");
 assert.equal(result.confidence,0.91);
});
test("no external Jev call for unknown state or unavailable winner",async()=>{
 const policy=compileScenarios(evidence);
 const fail=async()=>{throw new Error("must not call Jev");};
 assert.equal((await requestCompiledJevChoice(policy,"unknown",["inspect"],fail)).status,"no_decision");
 assert.equal((await requestCompiledJevChoice(policy,"visible",["hold"],fail)).status,"no_decision");
});
test("invalid or invented Jev probabilities abstain",async()=>{
 const policy=compileScenarios(evidence);
 const result=await requestCompiledJevChoice(policy,"visible",["inspect"],async()=>({status:"choice",action:"inspect",confidence:1,probabilities:{other:1}}));
 assert.equal(result.status,"no_decision");
});
