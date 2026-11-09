import test from 'node:test';
import assert from 'node:assert/strict';
import {consolidateUsage,type CorrelatedUsage} from '../src/cross-source-dedup.js';
const base={partnerId:'p',customerId:'c',provider:'openai',model:'m',workflow:'w',
 occurredAt:'2026-11-01T12:00:00Z',currency:'USD'};
const record=(source:string,id:string,correlationId?:string):CorrelatedUsage=>({
 ...base,source,id,correlationId,amountMinor:100});
test('explicit correlation prevents duplicate charges across Langfuse and OTel',()=>{
 const r=consolidateUsage({partnerId:'p',customerId:'c',records:[
 record('langfuse','1','req1'),record('otel','2','req1')]});
 assert.equal(r.usage.length,1);assert.equal(r.suppressed.length,1);
});
test('unlinked identical events are not silently merged',()=>{
 const r=consolidateUsage({partnerId:'p',customerId:'c',records:[
 record('langfuse','1'),record('otel','2')]});
 assert.equal(r.usage.length,2);assert.equal(r.unresolved.length,2);
});
test('billed cost takes precedence over estimated correlated record',()=>{
 const r=consolidateUsage({partnerId:'p',customerId:'c',records:[
 {...record('otel','1','req1'),costAuthority:'ESTIMATED'},
 {...record('litellm','2','req1'),costAuthority:'BILLED',amountMinor:150}]});
 assert.equal(r.usage[0].amountMinor,150);
});
test('cross-customer usage is rejected',()=>{
 assert.throws(()=>consolidateUsage({partnerId:'p',customerId:'c',records:[
 {...record('otel','1'),customerId:'other'}]}),/cross_tenant_usage/);
});
test('conflicting currencies cannot be silently consolidated',()=>{
 assert.throws(()=>consolidateUsage({partnerId:'p',customerId:'c',records:[
 record('otel','1','req1'),{...record('langfuse','2','req1'),currency:'NOK'}]}),
 /correlated_currency_conflict/);
});

test('reused correlation within a single source cannot suppress charges',()=>{
 assert.throws(()=>consolidateUsage({partnerId:'p',customerId:'c',records:[
 record('litellm','request-1','shared'),record('litellm','request-2','shared')]}),
 /correlation_reused_within_source/);
});
