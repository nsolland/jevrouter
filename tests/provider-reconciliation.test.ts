import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileProviderCosts} from '../src/provider-reconciliation.js';
const scope={partnerId:'p',customerId:'c',currency:'NOK',periodStart:'2026-11-01',periodEnd:'2026-11-02'};
const usage=[{id:'u1',partnerId:'p',customerId:'c',currency:'NOK',source:'otel',provider:'openai',
 model:'m',workflow:'w',occurredAt:'2026-11-01T12:00:00Z',amountMinor:100}];
const invoice=(id:string,start:string,end:string,amountMinor:number)=>({
 id,partnerId:'p',customerId:'c',currency:'NOK',source:'billing',provider:'openai',
 periodStart:start,periodEnd:end,amountMinor});
test('two consecutive daily invoices reconcile against usage',()=>{
 const [r]=reconcileProviderCosts({...scope,usage,invoices:[
 invoice('i1','2026-11-01','2026-11-01',50),
 invoice('i2','2026-11-02','2026-11-02',50)]});
 assert.equal(r.status,'MATCH');assert.equal(r.differenceMinor,0);
});
test('partial invoice coverage is not presented as a zero-cost match',()=>{
 const [r]=reconcileProviderCosts({...scope,usage,invoices:[
 invoice('i1','2026-11-01','2026-11-01',100)]});
 assert.equal(r.status,'PARTIAL_COVERAGE');assert.equal(r.invoiceMinor,null);
});
test('invoice disagreement is visible',()=>{
 const [r]=reconcileProviderCosts({...scope,usage,invoices:[
 invoice('i1','2026-11-01','2026-11-02',120)]});
 assert.equal(r.status,'MISMATCH');assert.equal(r.differenceMinor,20);
});
test('cross-tenant invoice is rejected',()=>{
 assert.throws(()=>reconcileProviderCosts({...scope,usage,invoices:[
 {...invoice('i1','2026-11-01','2026-11-02',100),customerId:'other'}]}),
 /reconciliation_scope_denied/);
});
