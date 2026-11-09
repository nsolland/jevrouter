/** White-label partner contract: partner owns customer-facing identity.
 * All tenant operations must be scoped to partner and customer together.
 */
export type PartnerBrand={partnerId:string;productName:string;supportEmail:string;
 domain:string;logoUrl?:string;legalEntity:string;reportFooter?:string};
export type PartnerCustomer={partnerId:string;customerId:string;displayName:string;
 enabled:boolean;allowedDomains:string[]};
export type WhiteLabelContext={brand:PartnerBrand;customer:PartnerCustomer;
 customerFacing:{productName:string;supportEmail:string;legalEntity:string;
 reportFooter:string};scopeKey:string};
const safeId=(v:string)=>/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(v);
const safeDomain=(v:string)=>/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(v);
export function resolveWhiteLabelContext(
 brand:PartnerBrand,customer:PartnerCustomer,requestedPartnerId:string,requestedCustomerId:string
):WhiteLabelContext {
 if(!safeId(requestedPartnerId)||!safeId(requestedCustomerId)||
 brand.partnerId!==requestedPartnerId||customer.partnerId!==requestedPartnerId||
 customer.customerId!==requestedCustomerId||!customer.enabled)
 throw new Error('partner_customer_scope_denied');
 if(!brand.productName.trim()||!brand.supportEmail.trim()||!brand.legalEntity.trim()||
 !safeDomain(brand.domain)||!customer.allowedDomains.every(safeDomain))
 throw new Error('invalid_partner_brand');
 return {brand,customer,scopeKey:requestedPartnerId+':'+requestedCustomerId,
 customerFacing:{productName:brand.productName,supportEmail:brand.supportEmail,
 legalEntity:brand.legalEntity,reportFooter:brand.reportFooter??''}};
}
export function renderWhiteLabelReport<T extends {tenantId:string;partnerId:string}>(
 report:T,context:WhiteLabelContext
) {
 if(report.partnerId!==context.brand.partnerId||
 report.tenantId!==context.customer.customerId)
 throw new Error('report_scope_denied');
 return {product:context.customerFacing.productName,
 customer:context.customer.displayName,issuer:context.customerFacing.legalEntity,
 support:context.customerFacing.supportEmail,
 footer:context.customerFacing.reportFooter,report};
}
