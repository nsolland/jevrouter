import test from "node:test";
import assert from "node:assert/strict";
import {ZeroGpuSystemOneProvider,createZeroGpuCompilationDecisionProvider} from "../dist/intelligence-zerogpu.js";
const candidate={state:"base",sourceDigest:"a".repeat(64),candidates:[
 {action:"inspect",estimatedReward:1,support:22},
 {action:"hold",estimatedReward:0.5,support:12}
]};
test("ZeroGPU provider targets documented System One d1.1 with bearer auth",async()=>{
 const old=globalThis.fetch;let called=0;
 globalThis.fetch=async(url,init)=>{
  called++;
  assert.equal(url,"https://api.zerogpu.ai/v1/systemone");
  assert.equal(init.headers.Authorization,"Bearer secret-only-for-test");
  const payload=JSON.parse(init.body);
  assert.equal(payload.model,"d1.1");
  assert.equal(payload.questions.compiled_choice.type,"choice");
  return new Response(JSON.stringify({answers:{compiled_choice:{type:"choice",choice:"hold",confidence:0.8,probabilities:{inspect:0.2,hold:0.8}}}}),{status:200,headers:{"content-type":"application/json"}});
 };
 try{
  const provider=createZeroGpuCompilationDecisionProvider({apiKey:"secret-only-for-test",timeoutMs:1000});
  const decision=await provider(candidate);
  assert.equal(decision.action,"hold");
  assert.equal(called,1);
 }finally{globalThis.fetch=old;}
});
test("remote auth errors fail closed and do not invent a decision",async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response('{"error":"forbidden"}',{status:403});
 try{
  const p=createZeroGpuCompilationDecisionProvider({apiKey:"secret-only-for-test"});
  assert.equal((await p(candidate)).status,"no_decision");
 }finally{globalThis.fetch=old;}
});
test("invalid endpoint and missing API key rejected",()=>{
 assert.throws(()=>new ZeroGpuSystemOneProvider({apiKey:""}),/API key/);
 assert.throws(()=>new ZeroGpuSystemOneProvider({apiKey:"test",endpoint:"http://localhost:8080"}),/HTTPS/);
});
