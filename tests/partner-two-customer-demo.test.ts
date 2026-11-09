import test from 'node:test';
import assert from 'node:assert/strict';
import {runPartnerPilot,type ReadOnlySpendAdapter} from '../src/partner-pilot.js';
import {planPrompt} from '../src/pre-prompt-intelligence.js';
import {assessAiSpend} from '../src/spend-assessment.js';
const brand={partnerId:'integrator-nordic',productName:'Nordic AI Value',
 supportEmail:'service@example.org',domain:'value.example.org',legalEntity:'Integrator Nordic AS'};
const clients=[
 {partnerId:brand.partnerId,customerId:'customer-a',displayName:'Customer A',
  enabled:true,allowedDomains:['a.example.org']},
 {partnerId:brand.partnerId,customerId:'customer-b',displayName:'Customer B',
  enabled:true,allowedDomains:['b.example.org']}
];
const rows={
 'customer-a':{usage:125000,invoice:150000},
 'customer-b':{usage:84000,invoice:90000}
} as const;
const adapter:ReadOnlySpendAdapter={id:'synthetic-read-only',
 async readUsage(partnerId,customerId){
  const row=rows[customerId as keyof typeof rows];
  if(!row)throw Error('unknown_customer');
  return [{id:'usage-'+customerId,partnerId,customerId,source:'synthetic-otel',
   provider:'anthropic',model:'synthetic-model',workflow:'analysis',
   occurredAt:'2026-11-09',amountMinor:row.usage,currency:'NOK'}];
 },
 async readInvoices(partnerId,customerId){
  const row=rows[customerId as keyof typeof rows];
  if(!row)throw Error('unknown_customer');
  return [{id:'invoice-'+customerId,partnerId,customerId,source:'synthetic-invoice',
   provider:'anthropic',periodStart:'2026-11-01',periodEnd:'2026-11-30',
   amountMinor:row.invoice,currency:'NOK'}];
 }};
test('two-customer white-label assessment is isolated and reports measured discrepancies',async()=>{
 const reports=await Promise.all(clients.map(customer=>runPartnerPilot({
  brand,customer,adapter,periodStart:'2026-11-01',periodEnd:'2026-11-30',currency:'NOK'})));
 assert.equal(reports[0].product,'Nordic AI Value');
 assert.equal(reports[1].product,'Nordic AI Value');
 assert.equal(reports[0].report.tenantId,'customer-a');
 assert.equal(reports[1].report.tenantId,'customer-b');
 assert.equal(reports[0].report.spend.unreconciledMinor,25000);
 assert.equal(reports[1].report.spend.unreconciledMinor,6000);
 assert.equal(reports[0].report.roi.status,'NOT_ESTABLISHED');
 assert.equal(reports[1].report.roi.status,'NOT_ESTABLISHED');
 const plan=planPrompt({tenantId:'customer-a',actorId:'operator',
  originalPrompt:'Analyze monthly AI costs',purpose:'AI spend assessment',
  dataClass:'internal',maxCostMinor:1000,requiresAction:false,approvedModels:['model-a']});
 assert.equal(plan.executionAuthorized,false);
 assert.equal(plan.intent,'analysis');
});
test('synthetic outcome linkage never claims causal ROI',()=>{
 const report=assessAiSpend({tenantId:'customer-a',partnerId:brand.partnerId,
  periodStart:'2026-11-01',periodEnd:'2026-11-30',currency:'NOK',
  invoiceMinor:150000,usageMinor:125000,evidencedBenefitMinor:200000,
  baselineBenefitMinor:100000,evidence:[{id:'outcome-1',tenantId:'customer-a',
  kind:'outcome',source:'synthetic-ledger',observedAt:'2026-11-09',
  periodStart:'2026-11-01',periodEnd:'2026-11-30',digest:'synthetic',
  dataClass:'aggregate',verified:true}]});
 assert.equal(report.roi.status,'OBSERVED_NOT_CAUSAL');
 assert.equal(report.roi.netObservedBenefitMinor,100000);
});
