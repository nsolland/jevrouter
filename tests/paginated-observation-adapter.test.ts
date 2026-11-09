import test from 'node:test';
import assert from 'node:assert/strict';
import {collectScopedPages} from '../src/paginated-observation-adapter.js';
test('cursor pagination reads every page without duplicating observations',async()=>{
 const items=await collectScopedPages(async({cursor})=>cursor===null?
 {items:[{id:'a',partnerId:'p',customerId:'c'}],nextCursor:'next'}:
 {items:[{id:'b',partnerId:'p',customerId:'c'}],nextCursor:null},'p','c');
 assert.deepEqual(items.map(x=>x.id),['a','b']);
});
test('reject cross-customer observation from external source',async()=>{
 await assert.rejects(collectScopedPages(async()=>({
 items:[{id:'a',partnerId:'p',customerId:'other'}],nextCursor:null
 }),'p','c'),/source_scope_violation/);
});
test('reject cursor cycles',async()=>{
 await assert.rejects(collectScopedPages(async()=>({
 items:[],nextCursor:'same'
 }),'p','c'),/pagination_cycle/);
});
test('reject duplicate observations across pages',async()=>{
 await assert.rejects(collectScopedPages(async({cursor})=>({
 items:[{id:'a',partnerId:'p',customerId:'c'}],nextCursor:cursor===null?'next':null
 }),'p','c'),/duplicate_observation/);
});
