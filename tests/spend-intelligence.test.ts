import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateUsage,summarizeSpend,buildSpendReport,type SpendPolicy} from '../src/spend-intelligence.js';
const policy: SpendPolicy = {version:'1',tenantId:'t1',currency:'NOK',rules:[{
  id:'research',roles:['analyst'],useCases:['research'],providers:['anthropic'],
  models:['claude'],maxMonthlyMinor:10000,dataClasses:['public'],
  effectAllowed:false,requiresApproval:true
}]};
const request = {tenantId:'t1',role:'analyst',useCase:'research',provider:'anthropic',
  model:'claude',dataClass:'public',estimatedMinor:100,monthSpentMinor:0,
  effect:false,approved:false};
test('requires approval and permits approved usage',()=>{
  assert.equal(evaluateUsage(policy,request).outcome,'STEP_UP');
  assert.equal(evaluateUsage(policy,{...request,approved:true}).outcome,'ALLOW');
});
test('denies cross-tenant, over-budget, unsafe data and effects',()=>{
  assert.equal(evaluateUsage(policy,{...request,tenantId:'t2'}).outcome,'DENY');
  assert.equal(evaluateUsage(policy,{...request,monthSpentMinor:9999}).outcome,'DENY');
  assert.equal(evaluateUsage(policy,{...request,dataClass:'secret'}).outcome,'DENY');
  assert.equal(evaluateUsage(policy,{...request,effect:true}).outcome,'DENY');
});
test('aggregates invoice-linked records and emits report',()=>{
  const summary=summarizeSpend([{id:'a',tenantId:'t1',provider:'anthropic',amountMinor:500,
    currency:'NOK',occurredAt:'2026-11-09',actorId:'user',department:'engineering',
    useCase:'research',model:'claude',invoiceId:'inv'}],'t1','NOK');
  assert.equal(summary.totalMinor,500);
  assert.equal(summary.byProvider.anthropic,500);
  assert.equal(buildSpendReport(summary,policy).policyRules[0].id,'research');
});
test('rejects mixed tenants and duplicate records',()=>{
  const row={id:'a',tenantId:'t1',provider:'anthropic',amountMinor:500,
    currency:'NOK',occurredAt:'2026-11-09',actorId:'user',department:'engineering',
    useCase:'research',model:'claude',invoiceId:'inv'};
  assert.throws(()=>summarizeSpend([{...row,tenantId:'t2'}],'t1','NOK'));
  assert.throws(()=>summarizeSpend([row,row],'t1','NOK'));
});
