import { assessAiSpend, type AssessmentInput, type AssessmentReport } from "./spend-assessment.js";
import { compareCustomerRoi, type RoiScenario, type RoiWeights, type RoiComparison } from "./customer-roi-time.js";

/** Customer-owned scenario extension to the existing evidence-based AI Spend Scan.
 * The economic ranking is hypothetical; it must never upgrade evidence-based ROI status. */
export interface TimeAwareSpendAssessment {
  assessment: AssessmentReport;
  scenarioComparison: RoiComparison;
  classification: "SCENARIO_NOT_CAUSAL";
  currency: string;
  assumptions: RoiWeights;
}
export function assessTimeAwareAiSpend(
  assessment: AssessmentInput,
  scenarios: readonly RoiScenario[],
  customerWeights: RoiWeights,
): TimeAwareSpendAssessment {
  const report = assessAiSpend(assessment);
  const scenarioComparison = compareCustomerRoi(scenarios, customerWeights);
  return {
    assessment: report,
    scenarioComparison,
    classification: "SCENARIO_NOT_CAUSAL",
    currency: report.currency,
    assumptions: { ...customerWeights },
  };
}
