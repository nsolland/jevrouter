import test from "node:test";
import assert from "node:assert/strict";
import {createNativeJevDecisionAdapter} from "../dist/intelligence-native-jev.js";
const base={state:"base",sourceDigest:"a".repeat(64),candidates:[
 {action:"scan",estimatedReward:3,support:15},
 {action:"hold",estimatedReward:1,support:10}
]};
test("native typed Choice provider owns final selection",async()=>{
 let calls=0;
 const adapter=createNativeJevDecisionAdapter({name:"native",async decide(request){
  calls++;assert.equal(request.questions.compiled_choice.type,"choice");
  assert.equal(request.state.compiled_source_sha256,base.sourceDigest);
  assert.equal(Object.keys(request.questions.compiled_choice.criteria).length,2);
  return {answers:{compiled_choice:{type:"choice",choice:"hold",confidence:0.8,probabilities:{scan:0.2,hold:0.8}}}};
 }});
 const out=await adapter(base);
 assert.equal(calls,1);assert.equal(out.action,"hold");
 assert.equal(out.confidence,0.8);
});
test("single candidate and malformed request abstain without external call",async()=>{
 let calls=0;
 const adapter=createNativeJevDecisionAdapter({name:"native",async decide(){calls++;throw Error("unexpected");}});
 assert.equal((await adapter({...base,candidates:[base.candidates[0]]})).status,"no_decision");
 assert.equal((await adapter({...base,sourceDigest:"invalid"})).status,"no_decision");
 assert.equal(calls,0);
});
test("external errors and invalid probability reports fail closed",async()=>{
 const errorAdapter=createNativeJevDecisionAdapter({name:"native",async decide(){throw Error("offline");}});
 assert.equal((await errorAdapter(base)).status,"no_decision");
 const bad=createNativeJevDecisionAdapter({name:"native",async decide(){return {answers:{compiled_choice:{type:"choice",choice:"scan",confidence:0.99,probabilities:{scan:1}}}};}});
 assert.equal((await bad(base)).status,"no_decision");
});
