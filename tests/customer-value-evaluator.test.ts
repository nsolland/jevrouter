import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCustomerValue} from '../src/customer-value-evaluator.js';
import type {SpendRecord} from '../src/spend-intelligence.js';
const records:SpendRecord[]=[{id:'1',tenantId:'customer',provider:'provider',
 amountMinor:1000,currency:'USD',occurredAt:'2026-11-01T00:00:00Z',
 actorId:'agent1',department:'ops',useCase:'support',model:'model'}];
const rubric={partnerId:'partner',customerId:'customer',revision:1,owner:'CUSTOMER' as const,
 criteria:[{id:'quality',label:'Customer quality',weight:80,enabled:true,
  metric:'quality' as const,minimumEvidence:'customer_attested' as const},
 {id:'time',label:'Time saved',weight:20,enabled:false,
  metric:'time_saved' as const,minimumEvidence:'hypothesis' as const}]};
const signal={id:'s1',actorId:'agent1',useCase:'support',metric:'quality' as const,
 description:'Possible improved support quality',evidence:'hypothesis' as const};
const args={partnerId:'partner',customerId:'customer',rubric,records,signals:[signal]};
test('evaluator proposes but customer evidence threshold controls acceptance',()=>{
 const result=evaluateCustomerValue(args);
 assert.equal(result.authority,'ADVISORY_ONLY');
 assert.equal(result.findings[0].acceptedForReview,false);
 assert.equal(result.findings[0].estimatedBenefitMinor,null);
 const attested=evaluateCustomerValue({...args,signals:[{...signal,evidence:'customer_attested'}]});
 assert.equal(attested.findings[0].acceptedForReview,true);
 assert.equal(attested.findings[0].customerWeight,80);
});
test('customer may disable value criterion without rewriting hypothesis',()=>{
 const changed=evaluateCustomerValue({...args,rubric:{...rubric,revision:2,
  criteria:[{...rubric.criteria[0],enabled:false},rubric.criteria[1]]},
  signals:[{...signal,evidence:'measured'}]});
 assert.equal(changed.findings[0].acceptedForReview,false);
});
test('evaluator rejects cross-tenant data and fabricated evidence amounts',()=>{
 assert.throws(()=>evaluateCustomerValue({...args,records:[{...records[0],tenantId:'other'}]}),
  /tenant_mismatch/);
 assert.throws(()=>evaluateCustomerValue({...args,signals:[{...signal,estimatedBenefitMinor:-1}]}),
  /invalid_value_signal/);
});
test('generated opportunity never fabricates savings',async()=>{
 const {proposeValueHypotheses}=await import('../src/customer-value-evaluator.js');
 const result=proposeValueHypotheses(records,'customer');
 assert.equal(result.length,1);
 assert.equal(result[0].evidence,'hypothesis');
 assert.equal(result[0].estimatedBenefitMinor,undefined);
});

test('customer can introduce an entirely new value metric and control its weight',async()=>{
 const {normalizeCustomerWeights,evaluateCustomerValue}=await import('../src/customer-value-evaluator.js');
 const criteria=[{id:'wellbeing',label:'Employee wellbeing',description:'Reduced employee strain',
  metric:'employee_wellbeing',weight:80,enabled:true,minimumEvidence:'customer_attested' as const},
  {id:'quality',label:'Quality',metric:'quality',weight:20,enabled:true,
   minimumEvidence:'measured' as const}];
 assert.equal(normalizeCustomerWeights(criteria)[0].normalizedWeightPct,80);
 const result=evaluateCustomerValue({partnerId:'p',customerId:'c',
  rubric:{partnerId:'p',customerId:'c',revision:1,owner:'CUSTOMER',criteria},
  records:[{id:'r',tenantId:'c',provider:'p',amountMinor:100,currency:'USD',
   occurredAt:'2026-11-10T12:00:00Z',actorId:'a',department:'d',useCase:'w',model:'m'}],
  signals:[{id:'s',actorId:'a',useCase:'w',metric:'employee_wellbeing',
   description:'Customer-defined outcome',evidence:'customer_attested'}]});
 assert.equal(result.findings[0].normalizedCustomerWeightPct,80);
 assert.equal(result.findings[0].status,'ELIGIBLE_FOR_CUSTOMER_DECISION');
});
