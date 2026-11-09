import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotSpendAdapter} from '../src/spend-snapshot-adapter.js';
import {runPartnerPilot} from '../src/partner-pilot.js';
const brand={partnerId:'p',productName:'Partner AI',supportEmail:'a@example.org',
 domain:'ai.example.org',legalEntity:'Partner AS'};
const customer={partnerId:'p',customerId:'a',displayName:'A',enabled:true,allowedDomains:[]};
test('OpenTelemetry snapshot + billing snapshot reconcile without network',async()=>{
 const adapter=createSnapshotSpendAdapter({id:'snapshot',otel:[{
 traceId:'t1',tenantId:'a',partnerId:'p',provider:'openai',model:'m',
 workflow:'analysis',timestamp:'2026-11-10T00:00:00Z',
 inputTokens:10,outputTokens:20,inputCostMinor:100,outputCostMinor:50,currency:'NOK'}],
 billing:[{lineId:'i1',tenantId:'a',partnerId:'p',provider:'openai',
 startDate:'2026-11-01',endDate:'2026-11-30',amountMinor:175,currency:'NOK'}]});
 const report=await runPartnerPilot({brand,customer,adapter,periodStart:'2026-11-01',
 periodEnd:'2026-11-30',currency:'NOK'});
 assert.equal(report.report.spend.usageMinor,150);
 assert.equal(report.report.spend.unreconciledMinor,25);
});
test('invalid negative usage rejected',async()=>{
 const adapter=createSnapshotSpendAdapter({id:'snapshot',otel:[{
 traceId:'t1',tenantId:'a',partnerId:'p',provider:'openai',model:'m',
 workflow:'analysis',timestamp:'2026-11-10T00:00:00Z',
 inputTokens:10,outputTokens:20,inputCostMinor:-1,outputCostMinor:50,currency:'NOK'}],billing:[]});
 await assert.rejects(adapter.readUsage('p','a'),/invalid_otel_record/);
});
