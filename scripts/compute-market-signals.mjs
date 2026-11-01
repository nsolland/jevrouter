import { createHash } from "node:crypto";

const A16Z_URL = "https://a16z.com/state-of-markets-ii/";
const PODCAST_URL = "https://a16z.com/podcast/the-1-trillion-ai-buildout-state-of-markets/";

/**
 * Dated outside market context. Never use these observations as local GPU stock,
 * deliverable capacity, project cash flow, calibrated demand or execution authority.
 */
export const MARKET_SIGNALS_2026 = Object.freeze([
  {
    id: "a16z-2026-capex", asOf: "2026-09-30", source: PODCAST_URL,
    evidence: "a16z_panel_estimate", scope: "five_major_hyperscalers_2026",
    metric: "estimated_capex_usd", value: 780_000_000_000, unit: "USD",
    caution: "Industry forecast, not realized spending, GPU supply, or profitability.",
  },
  {
    id: "a16z-2026-tech-earnings", asOf: "2026-08-31", source: A16Z_URL,
    evidence: "a16z_reported_statistic", scope: "sp500_earnings_growth_2026_to_late_august",
    metric: "tech_contribution_fraction", value: 0.76, unit: "fraction",
    caution: "Sector earnings concentration is not revenue available to a Compute Scout project.",
  },
  {
    id: "a16z-2026-quantified-ai", asOf: "2026-09-30", source: A16Z_URL,
    evidence: "a16z_reported_statistic", scope: "sp500_companies",
    metric: "reporting_quantifiable_ai_impact_fraction", value: 0.30, unit: "approx_fraction",
    caution: "Approximately 30%; disclosure is not independently demonstrated ROI.",
  },
  {
    id: "a16z-2026-ai-metrics", asOf: "2026-09-30", source: A16Z_URL,
    evidence: "a16z_reported_statistic", scope: "sp500_companies",
    metric: "reporting_tracked_ai_metric_fraction", value: 0.02, unit: "approx_fraction",
    caution: "Approximately 2%; reporting prevalence does not establish failed deployments.",
  },
  {
    id: "a16z-2026-a100-rates", asOf: "2026-09-30", source: A16Z_URL,
    evidence: "a16z_directional_market_observation", scope: "a100_rental_market",
    metric: "a100_rates_at_or_above_start_of_2026", value: true, unit: "directional",
    caution: "Not a provider quote or guarantee of future resale value.",
  },
  {
    id: "a16z-2026-compute-scarcity", asOf: "2026-09-30", source: A16Z_URL,
    evidence: "a16z_market_assessment", scope: "aggregate_ai_compute",
    metric: "demand_exceeds_supply", value: true, unit: "directional",
    caution: "Aggregate scarcity can coexist with local stranded or commercially unviable assets.",
  },
]);

export function marketContext() {
  return {
    kind: "dated_external_market_context_not_capacity",
    version: 1,
    asOf: "2026-09-30",
    signals: MARKET_SIGNALS_2026,
    digest: createHash("sha256").update(JSON.stringify(MARKET_SIGNALS_2026)).digest("hex"),
    implications: [
      "Screen distressed or underutilized GPU assets, but verify ownership, contracts and deliverability.",
      "Screen curtailed or locally stranded energy; compare compute to feasible grid-export proceeds.",
      "Route workloads by benchmarked cost per useful job; tokens are not interchangeable with GPU-hours.",
      "Measure realized customer value and independent utilization before capital allocation.",
    ],
    limitations: [
      "No signal is a verified local offer, grid connection, available MW, or independently calibrated elasticity.",
      "No signal authorizes reservation, purchase, switching generation, deployment or execution.",
    ],
  };
}

function finite(value, label, min = 0, max = Number.MAX_VALUE) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

function string(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value;
}

/**
 * Project economics with all inputs explicit. Local workload performance,
 * power, utilization, capital burden and monetizable demand must be supplied.
 *
 * Onsite export comparison uses the SAME generated energy in both alternatives;
 * generation cost is subtracted in each, so it cancels in the difference.
 * Grid-purchased power never receives an invented export alternative.
 */
export function assessComputeOpportunity(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("candidate is required");
  const id = string(candidate.id, "id");
  const observedAt = string(candidate.observedAt, "observedAt");
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error("invalid observedAt");
  const evidence = candidate.evidence;
  if (!evidence || !["observed", "scenario"].includes(evidence.kind)) throw new Error("evidence.kind must be observed or scenario");
  string(evidence.source, "evidence.source");
  const energySource = candidate.energySource;
  if (!["onsite_generation", "grid_purchased"].includes(energySource)) throw new Error("unsupported energySource");
  const gridExportPermitted = candidate.gridExportPermitted;
  if (typeof gridExportPermitted !== "boolean") throw new Error("gridExportPermitted must be boolean");
  if (energySource === "grid_purchased" && gridExportPermitted) throw new Error("grid-purchased power cannot claim onsite export");
  const exportPrice = candidate.exportPriceUsdPerKwh;
  if (gridExportPermitted) finite(exportPrice, "exportPriceUsdPerKwh");
  else if (exportPrice !== null && exportPrice !== undefined) throw new Error("exportPrice must be null without permitted export");

  const gpus = finite(candidate.gpus, "gpus", 1);
  if (!Number.isInteger(gpus)) throw new Error("gpus must be an integer");
  const hours = finite(candidate.availableComputeHoursPerYear, "availableComputeHoursPerYear", 0, 8760);
  const gpuKw = finite(candidate.gpuKwAtLoad, "gpuKwAtLoad", Number.EPSILON);
  const pue = finite(candidate.pue, "pue", 1);
  const revenueRate = finite(candidate.paidRevenueUsdPerGpuHour, "paidRevenueUsdPerGpuHour");
  const energyCostRate = finite(candidate.energyMarginalCostUsdPerKwh, "energyMarginalCostUsdPerKwh");
  const variableCostRate = finite(candidate.otherVariableCostUsdPerGpuHour, "otherVariableCostUsdPerGpuHour");
  const annualFixed = finite(candidate.annualFixedCostUsd, "annualFixedCostUsd");
  const annualCapital = finite(candidate.annualCapitalCostUsd, "annualCapitalCostUsd");
  const annualRiskReserve = finite(candidate.annualRiskReserveUsd, "annualRiskReserveUsd");

  const gpuHours = gpus * hours;
  const energyKwh = gpuHours * gpuKw * pue;
  const grossRevenueUsd = gpuHours * revenueRate;
  const energyCostUsd = energyKwh * energyCostRate;
  const variableCostUsd = gpuHours * variableCostRate;
  const totalAnnualCostUsd = energyCostUsd + variableCostUsd + annualFixed + annualCapital + annualRiskReserve;
  const computeNetUsd = grossRevenueUsd - totalAnnualCostUsd;
  const exportNetUsd = gridExportPermitted ? energyKwh * exportPrice - energyCostUsd : null;
  const incrementalVsExportUsd = exportNetUsd === null ? null : computeNetUsd - exportNetUsd;
  const thresholdUsdPerGpuHour = gpuHours > 0
    ? (totalAnnualCostUsd + (gridExportPermitted ? energyKwh * exportPrice - energyCostUsd : 0)) / gpuHours : null;
  const values = [gpuHours, energyKwh, grossRevenueUsd, energyCostUsd, totalAnnualCostUsd, computeNetUsd,
    exportNetUsd, incrementalVsExportUsd, thresholdUsdPerGpuHour].filter(v => v !== null);
  if (!values.every(Number.isFinite)) throw new Error("economic calculation overflow");
  return {
    kind: "decision_support_only", id, observedAt, evidence, energySource,
    status: evidence.kind === "scenario" ? "scenario_only" : "unverified_candidate",
    grossRevenueUsd, totalAnnualCostUsd, computeNetUsd, exportNetUsd, incrementalVsExportUsd,
    breakEvenPaidRevenueUsdPerGpuHour: thresholdUsdPerGpuHour,
    availableComputeHoursPerYear: hours, gpuHours, energyKwh,
    netUsdPerMwh: energyKwh > 0 ? computeNetUsd / (energyKwh / 1000) : null,
    requiresIndependentVerification: true, requiresAuthorization: true, execution: "not_started",
    caveats: [
      "Paid revenue, realized utilization, workload benchmarks and actual costs must be independently verified.",
      "Compute is flexible consumption, not electricity storage; no energy can be discharged later.",
      "Risk reserve is a supplied allowance, not a probabilistic risk-adjusted forecast.",
      "No permit, reservation, switching, purchase or deployment is performed.",
    ],
  };
}

export function assessComputePortfolio(candidates) {
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 1000) {
    throw new Error("candidates must contain 1..1000 entries");
  }
  const assessed = candidates.map(assessComputeOpportunity);
  if (new Set(assessed.map(a => a.id)).size !== assessed.length) throw new Error("duplicate opportunity id");
  return {
    kind: "decision_support_only",
    marketContext: { kind: "dated_external_market_context_not_capacity", digest: marketContext().digest },
    opportunities: assessed.sort((a, b) => a.id.localeCompare(b.id)),
    // Do not silently combine scenario rankings with observed/unverified listings.
    scenarioCount: assessed.filter(a => a.status === "scenario_only").length,
    unverifiedCount: assessed.filter(a => a.status === "unverified_candidate").length,
    execution: "not_started",
  };
}
