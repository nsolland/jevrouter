/** Partner-distributed AI Spend Intelligence assessment framework.
 * Analysis only. No prompt content, credentials or personal identifiers in reports.
 */
export type EvidenceKind='invoice'|'usage'|'outcome'|'policy'|'contract';
export type AssessmentEvidence={id:string;tenantId:string;kind:EvidenceKind;
 source:string;observedAt:string;periodStart:string;periodEnd:string;
 digest:string;dataClass:'aggregate'|'pseudonymous'|'personal'|'sensitive';
 lawfulBasis?:string;retentionUntil?:string;verified:boolean};
export type AssessmentInput={tenantId:string;partnerId:string;periodStart:string;
 periodEnd:string;currency:string;invoiceMinor:number;usageMinor:number;
 evidencedBenefitMinor?:number;baselineBenefitMinor?:number;
 evidence:AssessmentEvidence[]};
export type AssessmentReport={schemaVersion:'1.0';tenantId:string;partnerId:string;
 period:{start:string;end:string};currency:string;
 spend:{invoiceMinor:number;usageMinor:number;unreconciledMinor:number};
 roi:{status:'NOT_ESTABLISHED'|'OBSERVED_NOT_CAUSAL';netObservedBenefitMinor?:number};
 evidenceCoverage:Record<EvidenceKind,number>;privacyFindings:string[];
 recommendedControls:string[];disclaimer:string};
const money=(n:number)=>Number.isSafeInteger(n)&&n>=0;
const date=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s));
export function assessAiSpend(input:AssessmentInput):AssessmentReport {
 if(!input.tenantId||!input.partnerId||!input.currency||
 !date(input.periodStart)||!date(input.periodEnd)||input.periodStart>input.periodEnd||
 !money(input.invoiceMinor)||!money(input.usageMinor)||
 (input.evidencedBenefitMinor!==undefined&&!money(input.evidencedBenefitMinor))||
 (input.baselineBenefitMinor!==undefined&&!money(input.baselineBenefitMinor)))
 throw new Error('invalid_assessment');
 const coverage:Record<EvidenceKind,number>={invoice:0,usage:0,outcome:0,policy:0,contract:0};
 const privacyFindings:string[]=[];const seen=new Set<string>();
 for(const e of input.evidence) {
  if(e.tenantId!==input.tenantId) throw new Error('tenant_mismatch');
  if(!e.id||seen.has(e.id)||!e.digest||!e.source||!date(e.periodStart)||
   !date(e.periodEnd)||!date(e.observedAt.slice(0,10))||
   e.periodStart>e.periodEnd||e.periodStart<input.periodStart||e.periodEnd>input.periodEnd)
   throw new Error('invalid_evidence');
  seen.add(e.id);
  if(e.verified) coverage[e.kind]++;
  if(e.dataClass==='personal'||e.dataClass==='sensitive') {
   if(!e.lawfulBasis) privacyFindings.push('missing_lawful_basis:'+e.id);
   if(!e.retentionUntil||!date(e.retentionUntil)) privacyFindings.push('missing_retention:'+e.id);
  }
 }
 const hasBenefit=input.evidencedBenefitMinor!==undefined&&input.baselineBenefitMinor!==undefined&&coverage.outcome>0;
 const net=hasBenefit?input.evidencedBenefitMinor!-input.baselineBenefitMinor!:undefined;
 return {schemaVersion:'1.0',tenantId:input.tenantId,partnerId:input.partnerId,
  period:{start:input.periodStart,end:input.periodEnd},currency:input.currency,
  spend:{invoiceMinor:input.invoiceMinor,usageMinor:input.usageMinor,
   unreconciledMinor:input.invoiceMinor-input.usageMinor},
  roi:hasBenefit?{status:'OBSERVED_NOT_CAUSAL',netObservedBenefitMinor:net}:{status:'NOT_ESTABLISHED'},
  evidenceCoverage:coverage,privacyFindings,
  recommendedControls:[
   ...(coverage.invoice===0?['verify_invoices']:[]),
   ...(coverage.usage===0?['collect_metered_usage']:[]),
   ...(coverage.outcome===0?['establish_outcome_baseline']:[]),
   ...(privacyFindings.length?['privacy_review_required']:[]),
   ...(input.invoiceMinor!==input.usageMinor?['reconcile_invoice_to_usage']:[])],
  disclaimer:'No causal ROI is established by invoice reconciliation or linked outcomes alone. GDPR compliance requires contextual legal review.'};
}
