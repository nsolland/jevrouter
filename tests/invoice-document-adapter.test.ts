import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createInvoiceDocumentAdapter} from '../src/invoice-document-adapter.js';
const sha=(s:string)=>'sha256:'+createHash('sha256').update(s).digest('hex');
test('invoice document verifies digest, scopes customer and discards extra fields',async()=>{
 const raw=JSON.stringify([{id:'invoice-1',partnerId:'p',customerId:'c',
 provider:'vendor',periodStart:'2026-11-01',periodEnd:'2026-11-30',
 amountMinor:1234,currency:'USD',secret:'do-not-retain'}]);
 const adapter=createInvoiceDocumentAdapter({partnerId:'p',customerId:'c',
 source:'customer-invoice',document:raw,expectedSha256:sha(raw)});
 const rows=await adapter.readInvoices('p','c');
 assert.equal(rows.length,1);
 assert.equal(rows[0].amountMinor,1234);
 assert.equal(JSON.stringify(rows).includes('do-not-retain'),false);
 await assert.rejects(adapter.readInvoices('p','other'),/invoice_scope_violation/);
 assert.throws(()=>createInvoiceDocumentAdapter({partnerId:'p',customerId:'c',
 source:'customer-invoice',document:raw,expectedSha256:'sha256:'+'0'.repeat(64)}),
 /invoice_digest_mismatch/);
 const malicious=raw.replace('"customerId":"c"','"customerId":"other"');
 assert.throws(()=>createInvoiceDocumentAdapter({partnerId:'p',customerId:'c',
 source:'customer-invoice',document:malicious,expectedSha256:sha(malicious)}),
 /invoice_scope_violation/);
});
