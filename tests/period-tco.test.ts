import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPeriodTco,type TcoLine,type CostCategory} from '../src/period-tco.js';
const line: TcoLine={id:'invoice-1',partnerId:'p',customerId:'c',
 category:'MODEL_USAGE',currency:'NOK',amountMinor:10000,source:'invoice',verified:true};
const required:CostCategory[]=['MODEL_USAGE','AI_LICENSE','INFRASTRUCTURE',
 'INTEGRATION','OPERATIONS','HUMAN_REVIEW','SECURITY'];
test('incomplete TCO does not claim ROI',()=>{
 const r=assessPeriodTco({partnerId:'p',customerId:'c',currency:'NOK',
 lines:[line],coveredCategories:['MODEL_USAGE'],observedBenefitMinor:30000});
 assert.equal(r.status,'INCOMPLETE');assert.equal(r.roiStatus,'NOT_ESTABLISHED');
 assert.equal(r.observedRoiRatio,undefined);assert.equal(r.missingCategories.length,6);
});
test('complete declared TCO with verified outcome reports non-causal ROI',()=>{
 const r=assessPeriodTco({partnerId:'p',customerId:'c',currency:'NOK',
 lines:[line],coveredCategories:required,observedBenefitMinor:30000,
 verifiedOutcomeEvidence:true});
 assert.equal(r.status,'COMPLETE_DECLARED');
 assert.equal(r.roiStatus,'OBSERVED_NOT_CAUSAL');
 assert.equal(r.observedNetBenefitMinor,20000);assert.equal(r.observedRoiRatio,2);
});
test('tenant and currency isolation fail closed',()=>{
 const a={partnerId:'p',customerId:'c',currency:'NOK',
 lines:[{...line,customerId:'other'}],coveredCategories:required};
 assert.throws(()=>assessPeriodTco(a),/tco_scope_violation/);
 assert.throws(()=>assessPeriodTco({...a,lines:[{...line,currency:'USD'}]}),
 /tco_currency_mismatch/);
});
