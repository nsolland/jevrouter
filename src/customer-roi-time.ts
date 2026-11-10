/** AI ROI scenario comparison. Customer supplies the value of time and outcome.
 * Scenario arithmetic is not causal ROI evidence. No implicit currency conversion. */
export interface RoiScenario {
  id: string;
  attempts: number;
  accepted: number;
  totalModelCostMinor: number;
  totalElapsedMinutes: number;
  otherCostMinor?: number;
  observedValueMinor?: number;
}
export interface RoiWeights {
  /** Customer-assigned economic value of one minute of elapsed time in minor units. */
  valuePerMinuteMinor: number;
  /** Customer-assigned value per accepted outcome, in minor units. */
  valuePerAcceptedMinor: number;
  /** Whether elapsed time is actually economically costly for this workload. */
  timeCostApplies: boolean;
}
export interface RoiComparison {
  rows: Array<{id:string;accepted:number;costMinor:number;timeCostMinor:number;
    assignedValueMinor:number;netAssignedValueMinor:number;costPerAcceptedMinor:number|null}>;
  bestScenarioId: string|null;
  status:"SCENARIO_ONLY";
}
export function compareCustomerRoi(scenarios:readonly RoiScenario[],weights:RoiWeights):RoiComparison {
  if(!Number.isSafeInteger(weights.valuePerMinuteMinor)||weights.valuePerMinuteMinor<0||
     !Number.isSafeInteger(weights.valuePerAcceptedMinor)||weights.valuePerAcceptedMinor<0||
     typeof weights.timeCostApplies!=="boolean") throw new RangeError("Invalid customer ROI weights");
  const ids=new Set<string>();
  const rows=scenarios.map(s=>{
    if(!s.id||ids.has(s.id)||!Number.isSafeInteger(s.attempts)||s.attempts<0||
       !Number.isSafeInteger(s.accepted)||s.accepted<0||s.accepted>s.attempts||
       !Number.isSafeInteger(s.totalModelCostMinor)||s.totalModelCostMinor<0||
       !Number.isFinite(s.totalElapsedMinutes)||s.totalElapsedMinutes<0||
       !Number.isSafeInteger(s.otherCostMinor??0)||(s.otherCostMinor??0)<0||
       (s.observedValueMinor!==undefined&&(!Number.isSafeInteger(s.observedValueMinor)||s.observedValueMinor<0)))
       throw new RangeError("Invalid ROI scenario");
    ids.add(s.id);
    const costMinor=s.totalModelCostMinor+(s.otherCostMinor??0);
    const timeCostMinor=weights.timeCostApplies?s.totalElapsedMinutes*weights.valuePerMinuteMinor:0;
    const assignedValueMinor=s.observedValueMinor??s.accepted*weights.valuePerAcceptedMinor;
    const netAssignedValueMinor=assignedValueMinor-costMinor-timeCostMinor;
    if(![costMinor,timeCostMinor,assignedValueMinor,netAssignedValueMinor].every(Number.isSafeInteger))
      throw new RangeError("ROI arithmetic overflow or non-integer minor units");
    return {id:s.id,accepted:s.accepted,costMinor,timeCostMinor,assignedValueMinor,
      netAssignedValueMinor,costPerAcceptedMinor:s.accepted?costMinor/s.accepted:null};
  });
  const ranked=[...rows].sort((a,b)=>b.netAssignedValueMinor-a.netAssignedValueMinor||a.id.localeCompare(b.id));
  return {rows,bestScenarioId:ranked[0]?.id??null,status:"SCENARIO_ONLY"};
}
