import test from "node:test";
import assert from "node:assert/strict";
import {compileSequential} from "../dist/sequential-intelligence.js";
import {requestSequentialJevChoice} from "../dist/intelligence-jev-adapter.js";
const plan=compileSequential({states:["ready"],actions:["scan","hold"],horizon:1},(_,action)=>[{nextState:"ready",reward:action==="scan"?2:0,safe:true,terminal:true}]);
test("Jev is final decision maker, not planner",async()=>{
 const out=await requestSequentialJevChoice(plan,"ready",["scan","hold"],async req=>{
  assert.deepEqual(req.candidates.map(c=>c.action),["scan","hold"]);
  assert.match(req.sourceDigest,/^[a-f0-9]{64}$/);
  return {status:"choice",action:"hold",confidence:0.6,probabilities:{scan:0.4,hold:0.6}};
 });
 assert.equal(out.action,"hold");
});
test("unknown states abstain without a Jev call",async()=>{
 let calls=0;
 const out=await requestSequentialJevChoice(plan,"unknown",["scan"],async()=>{calls++;throw Error("unexpected")});
 assert.equal(calls,0);assert.equal(out.status,"no_decision");
});
test("external invalid choices are rejected",async()=>{
 const out=await requestSequentialJevChoice(plan,"ready",["scan"],async()=>({status:"choice",action:"other",confidence:1,probabilities:{other:1}}));
 assert.equal(out.status,"no_decision");
});