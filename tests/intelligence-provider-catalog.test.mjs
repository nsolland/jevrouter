import test from "node:test";
import assert from "node:assert/strict";
import {DECISION_PROVIDER_CATALOG,createDecisionProvider,classifyProviderAccess} from "../dist/intelligence-provider-catalog.js";

test("typed provider catalog keeps model separate from endpoint and credentials",()=>{
 assert.equal(DECISION_PROVIDER_CATALOG["zerogpu-d1.1"].model,"d1.1");
 assert.equal(DECISION_PROVIDER_CATALOG["zerogpu-d1.1"].endpoint,"https://api.zerogpu.ai/v1/systemone");
 assert.equal(DECISION_PROVIDER_CATALOG["open-spark"].transport,"local");
 assert.equal(DECISION_PROVIDER_CATALOG.typesafe.requiredCredential,"api-key");
 assert.equal(Object.keys(DECISION_PROVIDER_CATALOG).length,3);
});
test("provider factory selects the correct existing implementation without fallback",()=>{
 assert.equal(createDecisionProvider({provider:"zerogpu-d1.1",apiKey:"test-only"}).name,"zerogpu-d1.1");
 assert.equal(createDecisionProvider({provider:"typesafe",apiKey:"test-only"}).name,"typesafe");
 assert.match(createDecisionProvider({provider:"open-spark"}).name,/open-spark/);
 assert.throws(()=>createDecisionProvider({provider:"zerogpu-d1.1"}),/API key/);
 assert.throws(()=>createDecisionProvider({provider:"bogus",apiKey:"x"}),/unknown/);
 assert.throws(()=>createDecisionProvider({provider:"typesafe",apiKey:"x",timeoutMs:-1}),/timeout/);
});
test("access classification preserves the difference between missing key and 403",()=>{
 assert.equal(classifyProviderAccess(null,"credential_missing"),"credential_missing");
 assert.equal(classifyProviderAccess(403),"authentication_or_entitlement_rejected");
 assert.equal(classifyProviderAccess(401),"authentication_or_entitlement_rejected");
 assert.equal(classifyProviderAccess(429),"rate_limited");
 assert.equal(classifyProviderAccess(503),"provider_unavailable");
 assert.equal(classifyProviderAccess(null,"jev_timeout"),"network_or_timeout");
 assert.equal(classifyProviderAccess(200),"available");
});
test("ZeroGPU provider pins the model and rejects cross-model requests before any network call",async()=>{
 let calls=0;const old=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  calls++;assert.equal(url,"https://api.zerogpu.ai/v1/systemone");
  assert.equal(JSON.parse(init.body).model,"d1.1");
  return new Response(JSON.stringify({answers:{q:{type:"choice",choice:"hold",confidence:0.9,probabilities:{inspect:0.1,hold:0.9}}}}),{status:200});
 };
 try{
  const provider=createDecisionProvider({provider:"zerogpu-d1.1",apiKey:"test-only"});
  const request={state:"clear",candidates:[],questions:{q:{type:"choice",criteria:{inspect:"inspect",hold:"hold"}}}};
  assert.throws(()=>provider.decide({...request,model:"jev-latest"}),/pinned/);
  assert.equal(calls,0);
  const result=await provider.decide(request);
  assert.equal(result.answers.q.choice,"hold");
  assert.equal(calls,1);
 }finally{globalThis.fetch=old;}
});
