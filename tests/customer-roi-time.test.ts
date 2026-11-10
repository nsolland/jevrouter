import {test} from "node:test";
import {strict as assert} from "node:assert";
import {compareCustomerRoi} from "../src/customer-roi-time.js";
const cases=[{id:"fast",attempts:100,accepted:100,totalModelCostMinor:10000,totalElapsedMinutes:33},
{id:"cheap",attempts:100,accepted:100,totalModelCostMinor:1000,totalElapsedMinutes:133}];
test("unattended work values 90 percent model savings",()=>assert.equal(compareCustomerRoi(cases,{valuePerMinuteMinor:0,valuePerAcceptedMinor:1000,timeCostApplies:false}).bestScenarioId,"cheap"));
test("customer time value reverses decision",()=>assert.equal(compareCustomerRoi(cases,{valuePerMinuteMinor:100,valuePerAcceptedMinor:1000,timeCostApplies:true}).bestScenarioId,"fast"));
test("customer value per accepted outcome affects outcome-sensitive ROI",()=>{const c=[...cases,{id:"low_quality",attempts:100,accepted:10,totalModelCostMinor:100,totalElapsedMinutes:100}];assert.equal(compareCustomerRoi(c,{valuePerMinuteMinor:0,valuePerAcceptedMinor:1000,timeCostApplies:false}).bestScenarioId,"cheap")});
test("reject impossible and overflow measurements",()=>assert.throws(()=>compareCustomerRoi([{...cases[0],accepted:101}],{valuePerMinuteMinor:0,valuePerAcceptedMinor:1,timeCostApplies:false}),RangeError));
