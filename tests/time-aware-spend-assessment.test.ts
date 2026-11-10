import {test} from "node:test";
import {strict as assert} from "node:assert";
import {assessTimeAwareAiSpend} from "../src/time-aware-spend-assessment.js";
const base={tenantId:"tenant-a",partnerId:"partner-a",periodStart:"2026-10-01",periodEnd:"2026-10-31",currency:"USD",invoiceMinor:10000,usageMinor:10000,evidence:[]};
const cases=[{id:"fast",attempts:100,accepted:100,totalModelCostMinor:10000,totalElapsedMinutes:33},{id:"cheap",attempts:100,accepted:100,totalModelCostMinor:1000,totalElapsedMinutes:133}];
test("AI Spend Scan retains NOT_ESTABLISHED while comparing time scenarios",()=>{
 const result=assessTimeAwareAiSpend(base,cases,{valuePerMinuteMinor:0,valuePerAcceptedMinor:1000,timeCostApplies:false});
 assert.equal(result.assessment.roi.status,"NOT_ESTABLISHED");
 assert.equal(result.classification,"SCENARIO_NOT_CAUSAL");
 assert.equal(result.scenarioComparison.bestScenarioId,"cheap");
});
test("customer-defined time value changes best scenario, not evidence classification",()=>{
 const result=assessTimeAwareAiSpend(base,cases,{valuePerMinuteMinor:100,valuePerAcceptedMinor:1000,timeCostApplies:true});
 assert.equal(result.scenarioComparison.bestScenarioId,"fast");
 assert.equal(result.assessment.roi.status,"NOT_ESTABLISHED");
});
test("tenant evidence mismatch remains fail-closed",()=>{
 assert.throws(()=>assessTimeAwareAiSpend({...base,evidence:[{id:"e1",tenantId:"other",kind:"outcome",source:"x",observedAt:"2026-10-01",periodStart:"2026-10-01",periodEnd:"2026-10-31",digest:"abc",dataClass:"aggregate",verified:true}]},cases,{valuePerMinuteMinor:0,valuePerAcceptedMinor:1000,timeCostApplies:false}),/tenant_mismatch/);
});
