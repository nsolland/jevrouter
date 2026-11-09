import test from 'node:test';
import assert from 'node:assert/strict';
import {assessAiSpend} from '../src/spend-assessment.js';
const base={tenantId:'customer-1',partnerId:'integrator-1',
 periodStart:'2026-01-01',periodEnd:'2026-12-31',currency:'NOK',
 invoiceMinor:2900000000,usageMinor:2500000000,evidence:[]};
test('unreconciled spend does not imply ROI',()=>{
 const r=assessAiSpend(base);
 assert.equal(r.spend.unreconciledMinor,400000000);
 assert.equal(r.roi.status,'NOT_ESTABLISHED');
 assert.ok(r.recommendedControls.includes('reconcile_invoice_to_usage'));
});
test('cross tenant evidence rejected',()=>{
 assert.throws(()=>assessAiSpend({...base,evidence:[{id:'x',tenantId:'other',
 kind:'invoice' as const,source:'invoice',observedAt:'2026-11-09',
 periodStart:'2026-01-01',periodEnd:'2026-12-31',digest:'hash',
 dataClass:'aggregate' as const,verified:true}]}),/tenant_mismatch/);
});
test('personal evidence requires lawful basis and retention review',()=>{
 const r=assessAiSpend({...base,evidence:[{id:'x',tenantId:'customer-1',
 kind:'usage',source:'meter',observedAt:'2026-11-09',
 periodStart:'2026-01-01',periodEnd:'2026-12-31',digest:'hash',
 dataClass:'personal',verified:true}]});
 assert.equal(r.privacyFindings.length,2);
});
