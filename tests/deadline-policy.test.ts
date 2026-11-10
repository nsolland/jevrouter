import { strict as assert } from "node:assert";
import { test } from "node:test";
import { selectDeadlineRoute } from "../src/deadline-policy.js";
const candidates = [
 {id:"fast",expectedDurationMs:10000,expectedCostUsd:1,estimatedQuality:0.95,verified:true},
 {id:"cheap",expectedDurationMs:80000,expectedCostUsd:0.1,estimatedQuality:0.95,verified:true},
];
test("customer deadline selects fast candidate",()=>{
 assert.equal(selectDeadlineRoute({urgency:"fast",minQuality:0.9},candidates).selected?.id,"fast");
});
test("ten minute tolerance selects cheaper candidate",()=>{
 assert.equal(selectDeadlineRoute({urgency:"can_wait",minQuality:0.9},candidates).selected?.id,"cheap");
});
test("time value can outweigh savings",()=>{
 assert.equal(selectDeadlineRoute({urgency:"can_wait",minQuality:0.9,valuePerMinuteUsd:1},candidates).selected?.id,"fast");
});
test("quality and verification fail closed",()=>{
 assert.equal(selectDeadlineRoute({urgency:"can_wait",minQuality:0.99},candidates).status,"abstain");
 assert.equal(selectDeadlineRoute({urgency:"can_wait",minQuality:0.9},[{...candidates[0],verified:false}]).status,"abstain");
});
test("budget and invalid policy",()=>{
 assert.equal(selectDeadlineRoute({urgency:"fast",minQuality:0.9,maxCostUsd:0.2},candidates).status,"abstain");
 assert.throws(()=>selectDeadlineRoute({urgency:"fast",minQuality:0.9,deadlineMs:-1},candidates),RangeError);
});
