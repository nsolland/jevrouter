/** Evidence-aware period TCO; no assumed savings or currency conversions. */
export type CostCategory='MODEL_USAGE'|'AI_LICENSE'|'INFRASTRUCTURE'|'INTEGRATION'|
 'OPERATIONS'|'HUMAN_REVIEW'|'SECURITY'|'OTHER';
export type TcoLine={id:string;partnerId:string;customerId:string;category:CostCategory;
 currency:string;amountMinor:number;source:string;verified:boolean};
export type TcoResult={partnerId:string;customerId:string;currency:string;
 totalKnownMinor:number;byCategory:Record<CostCategory,number>;
 status:'INCOMPLETE'|'COMPLETE_DECLARED';missingCategories:CostCategory[];
 unverifiedIds:string[];evidenceIds:string[];observedNetBenefitMinor?:number;
 roiStatus:'NOT_ESTABLISHED'|'OBSERVED_NOT_CAUSAL';observedRoiRatio?:number};
const categories:CostCategory[]=['MODEL_USAGE','AI_LICENSE','INFRASTRUCTURE',
 'INTEGRATION','OPERATIONS','HUMAN_REVIEW','SECURITY','OTHER'];
export function assessPeriodTco(args:{partnerId:string;customerId:string;currency:string;
 lines:readonly TcoLine[];coveredCategories:readonly CostCategory[];
 observedBenefitMinor?:number;verifiedOutcomeEvidence?:boolean}):TcoResult{
 if(!args.partnerId||!args.customerId||!args.currency)throw Error('invalid_tco_scope');
 const covered=new Set(args.coveredCategories);
 if(covered.size!==args.coveredCategories.length||
  [...covered].some(c=>!categories.includes(c)))throw Error('invalid_tco_coverage');
 const totals=Object.fromEntries(categories.map(c=>[c,0])) as Record<CostCategory,number>;
 const seen=new Set<string>(),unverifiedIds:string[]=[];
 for(const l of args.lines){
  if(l.partnerId!==args.partnerId||l.customerId!==args.customerId)
   throw Error('tco_scope_violation');
  if(l.currency!==args.currency)throw Error('tco_currency_mismatch');
  if(!l.id||seen.has(l.id)||!l.source||!categories.includes(l.category)||
   !Number.isSafeInteger(l.amountMinor)||l.amountMinor<0)
   throw Error('invalid_tco_line');
  seen.add(l.id);
  const sum=totals[l.category]+l.amountMinor;
  if(!Number.isSafeInteger(sum))throw Error('tco_overflow');
  totals[l.category]=sum;
  if(!l.verified)unverifiedIds.push(l.id);
 }
 const total=Object.values(totals).reduce((a,b)=>a+b,0);
 if(!Number.isSafeInteger(total))throw Error('tco_overflow');
 const missing=categories.filter(c=>c!=='OTHER'&&!covered.has(c));
 const status=missing.length||unverifiedIds.length?'INCOMPLETE':'COMPLETE_DECLARED';
 const benefit=args.observedBenefitMinor;
 if(benefit!==undefined&&(!Number.isSafeInteger(benefit)||benefit<0))
  throw Error('invalid_tco_benefit');
 const observed=args.verifiedOutcomeEvidence===true&&benefit!==undefined;
 return {partnerId:args.partnerId,customerId:args.customerId,currency:args.currency,
  totalKnownMinor:total,byCategory:totals,status,missingCategories:missing,
  unverifiedIds,evidenceIds:[...seen],
  ...(observed?{observedNetBenefitMinor:benefit-total}:{}),
  roiStatus:observed?'OBSERVED_NOT_CAUSAL':'NOT_ESTABLISHED',
  ...(observed&&status==='COMPLETE_DECLARED'&&total>0?
   {observedRoiRatio:(benefit-total)/total}:{})};
}
