import { strict as assert } from "node:assert";
import { test } from "node:test";
import { routeWithDeadline } from "../src/deadline-route.js";

test("deadline filter fails closed before any provider call", async () => {
 const result = await routeWithDeadline({request:"test",candidates:[{id:"x",name:"X",type:"model",description:"test"}]}, {
   provider:"demo", deadlinePolicy:{urgency:"fast",minQuality:0.9},
   measurements:[{id:"x",verified:true,expectedCostUsd:0.1,expectedDurationMs:90000,estimatedQuality:0.95}],
 });
 assert.equal(result.status,"abstain");
});
test("unknown measurements cannot create capabilities", async () => {
 const result = await routeWithDeadline({request:"test",candidates:[{id:"x",name:"X",type:"model",description:"test"}]}, {
   provider:"demo", deadlinePolicy:{urgency:"can_wait",minQuality:0.9},
   measurements:[{id:"unknown",verified:true,expectedCostUsd:0.1,expectedDurationMs:100,estimatedQuality:0.95}],
 });
 assert.equal(result.status,"abstain");
});
