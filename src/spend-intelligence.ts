/** AI Spend Intelligence: deterministic, offline spend and usage policy analysis. */
export type SpendRecord = {
  id: string; tenantId: string; provider: string; amountMinor: number;
  currency: string; occurredAt: string; actorId: string; department: string;
  useCase: string; model: string; invoiceId?: string;
};
export type UsageRule = {
  id: string; roles: string[]; useCases: string[]; providers: string[];
  models: string[]; maxMonthlyMinor: number; dataClasses: string[];
  effectAllowed: boolean; requiresApproval: boolean;
};
export type SpendPolicy = {
  version: string; tenantId: string; currency: string; rules: UsageRule[];
};
export type UsageRequest = {
  tenantId: string; role: string; useCase: string; provider: string;
  model: string; dataClass: string; estimatedMinor: number;
  monthSpentMinor: number; effect: boolean; approved: boolean;
};
export type Decision = { outcome: 'ALLOW' | 'DENY' | 'STEP_UP'; reasons: string[]; ruleId?: string };
const validMoney = (n: number) => Number.isSafeInteger(n) && n >= 0;
const match = (xs: string[], x: string) => xs.includes(x);
export function evaluateUsage(policy: SpendPolicy, req: UsageRequest): Decision {
  if (policy.tenantId !== req.tenantId) return {outcome:'DENY',reasons:['tenant_mismatch']};
  if (!validMoney(req.estimatedMinor) || !validMoney(req.monthSpentMinor))
    return {outcome:'DENY',reasons:['invalid_amount']};
  const candidates = policy.rules.filter(r =>
    match(r.roles,req.role) && match(r.useCases,req.useCase) &&
    match(r.providers,req.provider) && match(r.models,req.model));
  if (candidates.length !== 1) return {outcome:'DENY',reasons:[candidates.length ? 'ambiguous_rule' : 'no_matching_rule']};
  const rule = candidates[0];
  if (!validMoney(rule.maxMonthlyMinor)) return {outcome:'DENY',reasons:['invalid_budget']};
  if (!match(rule.dataClasses,req.dataClass)) return {outcome:'DENY',reasons:['data_class_forbidden'],ruleId:rule.id};
  if (req.effect && !rule.effectAllowed) return {outcome:'DENY',reasons:['effect_forbidden'],ruleId:rule.id};
  if (req.estimatedMinor > rule.maxMonthlyMinor - req.monthSpentMinor)
    return {outcome:'DENY',reasons:['budget_exceeded'],ruleId:rule.id};
  if (rule.requiresApproval && !req.approved)
    return {outcome:'STEP_UP',reasons:['approval_required'],ruleId:rule.id};
  return {outcome:'ALLOW',reasons:[],ruleId:rule.id};
}
export type SpendSummary = {
  tenantId: string; currency: string; totalMinor: number;
  byProvider: Record<string,number>; byDepartment: Record<string,number>;
  byUseCase: Record<string,number>; unallocatedMinor: number;
  recordCount: number;
};
export function summarizeSpend(records: SpendRecord[], tenantId: string, currency: string): SpendSummary {
  const result: SpendSummary = {tenantId,currency,totalMinor:0,byProvider:{},byDepartment:{},
    byUseCase:{},unallocatedMinor:0,recordCount:0};
  const ids = new Set<string>();
  for (const r of records) {
    if (r.tenantId !== tenantId) throw new Error('tenant_mismatch');
    if (r.currency !== currency) throw new Error('currency_mismatch');
    if (!validMoney(r.amountMinor)) throw new Error('invalid_amount');
    if (!r.id || ids.has(r.id)) throw new Error('duplicate_or_missing_record_id');
    ids.add(r.id);
    if (!r.provider || !r.department || !r.useCase) throw new Error('missing_attribution');
    if (!/^\\d{4}-\\d{2}-\\d{2}/.test(r.occurredAt) || !Number.isFinite(Date.parse(r.occurredAt)))
      throw new Error('invalid_date');
    if (r.amountMinor > Number.MAX_SAFE_INTEGER-result.totalMinor) throw new Error('amount_overflow');
    result.totalMinor += r.amountMinor; result.recordCount++;
    for (const [group,key] of [[result.byProvider,r.provider],[result.byDepartment,r.department],
      [result.byUseCase,r.useCase]] as const) group[key]=(group[key]??0)+r.amountMinor;
    if (!r.actorId || !r.invoiceId) result.unallocatedMinor+=r.amountMinor;
  }
  return result;
}
export function buildSpendReport(summary: SpendSummary, policy: SpendPolicy) {
  if (summary.tenantId !== policy.tenantId || summary.currency !== policy.currency)
    throw new Error('policy_scope_mismatch');
  return {schemaVersion:'1.0',summary,policyVersion:policy.version,
    policyRules:policy.rules.map(r=>({id:r.id,roles:r.roles,useCases:r.useCases,
      providers:r.providers,models:r.models,dataClasses:r.dataClasses,
      monthlyLimitMinor:r.maxMonthlyMinor,effectAllowed:r.effectAllowed,
      requiresApproval:r.requiresApproval})),
    limitations:['Invoice totals do not establish realized ROI.',
      'Policy recommendations require customer approval before enforcement.',
      'This report does not change provider permissions or execute actions.']};
}
