import test from 'node:test';
import assert from 'node:assert/strict';
import {composeSpendSources} from '../src/composite-spend-adapter.js';
import type {ReadOnlySpendAdapter,MeteredUsage} from '../src/partner-pilot.js';
const row={id:'1',partnerId:'p',customerId:'c',source:'otel',provider:'openai',
 model:'m',workflow:'w',occurredAt:'2026-11-01T00:00:00Z',amountMinor:20,currency:'USD'};
const adapter=(id:string,rows:MeteredUsage[]):ReadOnlySpendAdapter=>({
 id,async readUsage(){return rows;},async readInvoices(){return [];}});
test('composite deduplicates correlated records before reporting',async()=>{
 const a=composeSpendSources({partnerId:'p',customerId:'c',sources:[
 adapter('otel',[{...row,correlationId:'r'} as MeteredUsage]),
 adapter('langfuse',[{...row,id:'2',source:'langfuse',correlationId:'r'} as MeteredUsage])]});
 assert.equal((await a.readUsage('p','c')).length,1);
 assert.equal(a.getLastReconciliation()?.suppressed.length,1);
});
test('composite rejects wrong customer and never returns partial results',async()=>{
 const a=composeSpendSources({partnerId:'p',customerId:'c',sources:[
 adapter('ok',[row]),{id:'bad',async readUsage(){throw Error('upstream_down');},
 async readInvoices(){return [];}}]});
 await assert.rejects(a.readUsage('p','c'),/upstream_down/);
 await assert.rejects(a.readUsage('p','other'),/composite_scope_violation/);
 assert.equal(a.getLastReconciliation(),null);
});
