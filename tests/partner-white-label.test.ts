import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveWhiteLabelContext,renderWhiteLabelReport} from '../src/partner-white-label.js';
const brand={partnerId:'integrator-1',productName:'Integrator AI Value',
 supportEmail:'support@example.com',domain:'ai.example.com',legalEntity:'Integrator AS'};
const customer={partnerId:'integrator-1',customerId:'client-1',
 displayName:'Client One',enabled:true,allowedDomains:['client.example.com']};
test('customer report uses partner branding',()=>{
 const context=resolveWhiteLabelContext(brand,customer,'integrator-1','client-1');
 const output=renderWhiteLabelReport({partnerId:'integrator-1',tenantId:'client-1',spend:100},context);
 assert.equal(output.product,'Integrator AI Value');
 assert.equal(output.issuer,'Integrator AS');
});
test('cross partner and cross customer report access denied',()=>{
 const context=resolveWhiteLabelContext(brand,customer,'integrator-1','client-1');
 assert.throws(()=>resolveWhiteLabelContext(brand,customer,'integrator-2','client-1'));
 assert.throws(()=>renderWhiteLabelReport({partnerId:'integrator-1',tenantId:'client-2'},context));
});
