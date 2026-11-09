/** Explicit invoice import. No inferred invoices, no currency conversion.
 * Source document digest is required to support independent reconciliation.
 */
import type {InvoiceLine,ReadOnlySpendAdapter} from './partner-pilot.js';
import {createHash} from 'node:crypto';
export type InvoiceImportRecord={
 id:string;partnerId:string;customerId:string;provider:string;
 periodStart:string;periodEnd:string;amountMinor:number;currency:string;
};
export function createInvoiceDocumentAdapter(args:{
 partnerId:string;customerId:string;source:string;document:string;
 expectedSha256:string;
}):ReadOnlySpendAdapter&{sourceDigest:string}{
 if(!args.partnerId||!args.customerId||!args.source||
  !/^sha256:[a-f0-9]{64}$/.test(args.expectedSha256))throw Error('invalid_invoice_provenance');
 const digest='sha256:'+createHash('sha256').update(args.document,'utf8').digest('hex');
 if(digest!==args.expectedSha256)throw Error('invoice_digest_mismatch');
 let rows:unknown;
 try{rows=JSON.parse(args.document);}catch{throw Error('invalid_invoice_document');}
 if(!Array.isArray(rows)||rows.length>100000)throw Error('invalid_invoice_document');
 const ids=new Set<string>(),invoices:InvoiceLine[]=[];
 for(const value of rows){
  if(!value||typeof value!=='object'||Array.isArray(value))
   throw Error('invalid_invoice_row');
  const r=value as Record<string,unknown>;
  if(r.partnerId!==args.partnerId||r.customerId!==args.customerId)
   throw Error('invoice_scope_violation');
  if(typeof r.id!=='string'||!r.id||ids.has(r.id)||
   typeof r.provider!=='string'||!r.provider||
   typeof r.currency!=='string'||!/^[A-Z]{3}$/.test(r.currency)||
   typeof r.periodStart!=='string'||typeof r.periodEnd!=='string'||
   !/^\d{4}-\d{2}-\d{2}$/.test(r.periodStart)||
   !/^\d{4}-\d{2}-\d{2}$/.test(r.periodEnd)||
   !Number.isFinite(Date.parse(r.periodStart))||
   !Number.isFinite(Date.parse(r.periodEnd))||
   r.periodStart>r.periodEnd||
   !Number.isSafeInteger(r.amountMinor)||(r.amountMinor as number)<0)
   throw Error('invalid_invoice_row');
  ids.add(r.id);
  invoices.push({id:r.id,partnerId:args.partnerId,customerId:args.customerId,
   source:args.source,provider:r.provider,periodStart:r.periodStart,
   periodEnd:r.periodEnd,amountMinor:r.amountMinor as number,currency:r.currency});
 }
 return {id:'invoice-document:'+args.source,sourceDigest:digest,
  async readUsage(p,c){if(p!==args.partnerId||c!==args.customerId)
   throw Error('invoice_scope_violation');return [];},
  async readInvoices(p,c){if(p!==args.partnerId||c!==args.customerId)
   throw Error('invoice_scope_violation');return invoices.map(x=>({...x}));}};
}
