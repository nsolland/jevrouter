/** Prompt event contract for AI Spend Intelligence.
 * Intent classifications are hypotheses until supported by observed outcomes.
 * Raw prompt bodies are deliberately not retained in this contract.
 */
export type PromptEvent = {
  eventId: string; tenantId: string; actorId: string; sessionId: string;
  timestamp: string; promptDigest: string; purpose: string; useCase: string;
  stakeholderId?: string; boardDecisionId?: string; shadowFindingId?: string;
  provider: string; model: string; inputTokens: number; outputTokens: number;
  costMinor: number; currency: string; resultRef?: string;
  outcomeRef?: string; approvedPurpose?: boolean;
};
export type PromptFinding = {
  eventId: string; tenantId: string; purpose: string; useCase: string;
  classification: 'UNVERIFIED_INTENT' | 'OBSERVED_OUTPUT' | 'OUTCOME_LINKED';
  costMinor: number; evidenceRefs: string[]; flags: string[];
};
const valid = (n:number)=>Number.isSafeInteger(n)&&n>=0;
export function analyzePromptEvent(event: PromptEvent, expectedTenant: string): PromptFinding {
  if(event.tenantId!==expectedTenant) throw new Error('tenant_mismatch');
  if(!event.eventId || !event.promptDigest || !event.actorId || !event.sessionId ||
     !event.purpose || !event.useCase || !event.provider || !event.model ||
     !Number.isFinite(Date.parse(event.timestamp)) ||
     ![event.inputTokens,event.outputTokens,event.costMinor].every(valid))
    throw new Error('invalid_prompt_event');
  const evidenceRefs=[event.resultRef,event.outcomeRef].filter((x):x is string=>!!x);
  const flags:string[]=[];
  if(!event.outcomeRef) flags.push('roi_not_established');
  if(event.approvedPurpose!==true) flags.push('purpose_not_approved');
  if(!event.stakeholderId) flags.push('stakeholder_unattributed');
  return {eventId:event.eventId,tenantId:event.tenantId,purpose:event.purpose,
    useCase:event.useCase,costMinor:event.costMinor,evidenceRefs,flags,
    classification:event.outcomeRef?'OUTCOME_LINKED':event.resultRef?'OBSERVED_OUTPUT':'UNVERIFIED_INTENT'};
}
export function buildPromptPortfolio(events: PromptEvent[], tenantId:string) {
  const ids=new Set<string>(); let totalMinor=0; const findings:PromptFinding[]=[];
  for(const event of events) {
    if(ids.has(event.eventId)) throw new Error('duplicate_event');
    ids.add(event.eventId);
    const finding=analyzePromptEvent(event,tenantId);
    if(totalMinor>Number.MAX_SAFE_INTEGER-finding.costMinor) throw new Error('amount_overflow');
    totalMinor+=finding.costMinor; findings.push(finding);
  }
  return {tenantId,totalMinor,findings,
    disclaimer:'Linked outcomes are not proof of causal AI ROI; independent attribution is required.'};
}
