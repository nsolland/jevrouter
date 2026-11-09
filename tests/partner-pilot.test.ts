import test from 'node:test';
import assert from 'node:assert/strict';
import {runPartnerPilot,type ReadOnlySpendAdapter} from '../src/partner-pilot.js';
const brand={partnerId:'partner',productName:'Partner AI Control',
 supportEmail:'help@example.com',domain:'ai.example.com',legalEntity:'Partner AS'};
const customer={partnerId:'partner',customerId:'client-a',displayName:'Client A',
 enabled:true,allowedDomains:['client.example.com']};
const adapter:ReadOnlySpendAdapter={id:'fixture',
 async readUsage(partnerId,customerId){return [{id:'u1',partnerId,customerId,
 source:'otel',provider:'anthropic',model:'m1',workflow:'research',
 occurredAt:'2026-11-02',amountMinor:700,currency:'NOK'}];},
 async readInvoices(partnerId,customerId){return [{id:'i1',partnerId,customerId,
 source:'invoice',provider:'anthropic',periodStart:'2026-11-01',
 periodEnd:'2026-11-30',amountMinor:1000,currency:'NOK'}];}};
test('partner pilot produces white label spend report with discrepancy',async()=>{
 const r=await runPartnerPilot({brand,customer,adapter,periodStart:'2026-11-01',
 periodEnd:'2026-11-30',currency:'NOK'});
 assert.equal(r.product,'Partner AI Control');
 assert.equal(r.report.spend.unreconciledMinor,300);
 assert.equal(r.report.roi.status,'NOT_ESTABLISHED');
});
test('partner pilot rejects mixed tenant source data',async()=>{
 const bad:ReadOnlySpendAdapter={...adapter,
 async readUsage(){return [{id:'x',partnerId:'other',customerId:'client-a',
 source:'otel',provider:'anthropic',model:'m1',workflow:'research',
 occurredAt:'2026-11-02',amountMinor:100,currency:'NOK'}];}};
 await assert.rejects(runPartnerPilot({brand,customer,adapter:bad,
 periodStart:'2026-11-01',periodEnd:'2026-11-30',currency:'NOK'}),/source_scope_violation/);
});
