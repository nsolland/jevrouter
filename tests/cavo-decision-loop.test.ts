import test from 'node:test';
import assert from 'node:assert/strict';
import {CavoDecisionLoop} from '../src/cavo-decision-loop.js';
test('customer-led closed-loop keeps forecast distinct from customer reported value',()=>{
 const loop=new CavoDecisionLoop('customer-a');
 loop.addInitiative({id:'i',customerId:'customer-a',rubricRevision:3,title:'Improve service quality',
  outcomes:[{criterionId:'quality',baseline:3,target:4.5,unit:'rating',evidence:'CUSTOMER_ATTESTED'}]});
 loop.addAllocationRule({id:'allocation',version:1,method:'USAGE',shares:{support:0.7,engineering:0.3}});
 loop.addCost({id:'call',amountMinor:1000,currency:'USD',actorId:'agent',workflowId:'support',
  attempt:'SUCCESS',ruleId:'allocation',ruleVersion:1});
 loop.addCost({id:'retry',amountMinor:500,currency:'USD',actorId:'agent',workflowId:'support',
  attempt:'RETRY',ruleId:'allocation',ruleVersion:1});
 loop.addAllocationRule({id:'allocation',version:2,method:'USAGE',shares:{support:1}});
 loop.addCost({id:'failure',amountMinor:500,currency:'USD',actorId:'agent',workflowId:'support',
  attempt:'FAILED',ruleId:'allocation',ruleVersion:2});
 assert.deepEqual(loop.allocate('USD').byUnit,{support:1550,engineering:450});
 loop.recommend({id:'r',initiativeId:'i',description:'Test narrower routing',
  forecastBenefitMinor:10000,forecastCostMinor:2000,assumptions:['No quality degradation']});
 loop.customerDecision({id:'d',recommendationId:'r',choice:'PROCEED',
  rationale:'Customer values quality above savings',customerActor:'customer-owner',
  at:'2026-11-10T12:00:00Z'});
 loop.followUp({id:'f',decisionId:'d',implemented:true,at:'2026-11-11T12:00:00Z',
  actualCostMinor:2500,realizedBenefitMinor:3000,evidence:'CUSTOMER_ATTESTED',
  sourceIds:['customer-review-1'],outcomes:[{criterionId:'quality',baseline:3,target:4.5,
   actual:4.2,unit:'rating',evidence:'CUSTOMER_ATTESTED'}]});
 assert.equal(loop.assessment('d').forecastVarianceMinor,-7000);
 assert.equal(loop.assessment('d').causalRoi,'NOT_ESTABLISHED');
 assert.equal(loop.audit().valid,true);
 assert.equal(loop.audit().count,9);
 assert.throws(()=>loop.addCost({id:'missing',amountMinor:1,currency:'USD',actorId:'a',
  workflowId:'w',attempt:'FAILED',ruleId:'allocation',ruleVersion:3}),/invalid_cost_event/);
 assert.throws(()=>loop.followUp({id:'bad',decisionId:'d',implemented:true,
  at:'2026-11-11T12:00:00Z',actualCostMinor:1,realizedBenefitMinor:1,
  evidence:'HYPOTHESIS',sourceIds:[],outcomes:[]}),/invalid_follow_up/);
});
