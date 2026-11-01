import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assessComputeOpportunity, assessComputePortfolio, marketContext } from "../scripts/compute-market-signals.mjs";
import { summarize, verifySnapshot, markdown } from "../scripts/compute-scout-report.mjs";

function candidate(overrides = {}) {
  return {
    id: "pilot-1", observedAt: "2026-11-01T12:00:00Z",
    evidence: { kind: "scenario", source: "synthetic-test-only" },
    energySource: "onsite_generation", gridExportPermitted: false, exportPriceUsdPerKwh: null,
    gpus: 10, availableComputeHoursPerYear: 2000, gpuKwAtLoad: 0.5, pue: 1.2,
    paidRevenueUsdPerGpuHour: 2, energyMarginalCostUsdPerKwh: 0.05,
    otherVariableCostUsdPerGpuHour: 0.2, annualFixedCostUsd: 1000,
    annualCapitalCostUsd: 5000, annualRiskReserveUsd: 2000,
    ...overrides,
  };
}

test("outside market signals are dated source-backed context, not live inventory", () => {
  const ctx = marketContext();
  assert.equal(ctx.kind, "dated_external_market_context_not_capacity");
  assert.equal(ctx.signals.length, 6);
  assert.ok(ctx.signals.every(s => s.source.startsWith("https://a16z.com/") && s.asOf && s.caution));
  assert.equal(ctx.digest, createHash("sha256").update(JSON.stringify(ctx.signals)).digest("hex"));
  assert.ok(ctx.limits === undefined);
});

test("computes annual scenario net and break even using explicit paid hours", () => {
  const outcome = assessComputeOpportunity(candidate());
  assert.equal(outcome.status, "scenario_only");
  assert.equal(outcome.gpuHours, 20000);
  assert.equal(outcome.energyKwh, 12000);
  assert.equal(outcome.grossRevenueUsd, 40000);
  assert.equal(outcome.totalAnnualCostUsd, 12600);
  assert.equal(outcome.computeNetUsd, 27400);
  assert.equal(outcome.breakEvenPaidRevenueUsdPerGpuHour, 0.63);
  assert.equal(outcome.exportNetUsd, null);
  assert.equal(outcome.requiresAuthorization, true);
  assert.equal(outcome.execution, "not_started");
});

test("compares on-site compute with feasible export without double-counting power cost", () => {
  const result = assessComputeOpportunity(candidate({
    gridExportPermitted: true, exportPriceUsdPerKwh: 0.2,
  }));
  assert.equal(result.computeNetUsd, 27400);
  assert.equal(result.exportNetUsd, 1800);
  assert.equal(result.incrementalVsExportUsd, 25600);
  assert.equal(result.breakEvenPaidRevenueUsdPerGpuHour, 0.72);
});

test("does not invent export value for grid-purchased energy", () => {
  const result = assessComputeOpportunity(candidate({ energySource: "grid_purchased" }));
  assert.equal(result.exportNetUsd, null);
  assert.throws(() => assessComputeOpportunity(candidate({
    energySource: "grid_purchased", gridExportPermitted: true, exportPriceUsdPerKwh: 0.1,
  })), /grid-purchased/);
});

test("zero evidenced operating hours cannot be treated as proven profit", () => {
  const result = assessComputeOpportunity(candidate({ availableComputeHoursPerYear: 0 }));
  assert.equal(result.gpuHours, 0);
  assert.equal(result.breakEvenPaidRevenueUsdPerGpuHour, null);
  assert.equal(result.computeNetUsd, -8000);
});

test("rejects missing, negative or impossible financial inputs", () => {
  assert.throws(() => assessComputeOpportunity(candidate({ paidRevenueUsdPerGpuHour: undefined })), /paidRevenue/);
  assert.throws(() => assessComputeOpportunity(candidate({ availableComputeHoursPerYear: 8761 })), /availableCompute/);
  assert.throws(() => assessComputeOpportunity(candidate({ pue: 0.8 })), /pue/);
  assert.throws(() => assessComputeOpportunity(candidate({ annualRiskReserveUsd: -1 })), /annualRiskReserve/);
  assert.throws(() => assessComputeOpportunity(candidate({ gpus: 1.5 })), /integer/);
  assert.throws(() => assessComputeOpportunity(candidate({ energySource: "onsite_generation", gridExportPermitted: true })), /exportPrice/);
  assert.throws(() => assessComputeOpportunity(candidate({ evidence: { kind: "observed", source: "" } })), /evidence.source/);
});

test("portfolio does not combine scenario and unverified candidate into a proven ranking", () => {
  const report = assessComputePortfolio([
    candidate({ id: "scenario" }),
    candidate({ id: "reported", evidence: { kind: "observed", source: "supplier-invoice-unverified" } }),
  ]);
  assert.equal(report.scenarioCount, 1);
  assert.equal(report.unverifiedCount, 1);
  assert.equal(report.execution, "not_started");
  assert.equal(report.opportunities[0].requiresIndependentVerification, true);
  assert.throws(() => assessComputePortfolio([candidate(), candidate()]), /duplicate/);
});

test("scout report carries external context but never changes the supplier observation digest", () => {
  const observedAt = "2026-11-01T12:00:00.000Z";
  const sources = [{ source: "akash", status: "ok", records: 0 }, { source: "openrouter", status: "ok", records: 0 }];
  const observations = [];
  const digest = createHash("sha256").update(JSON.stringify({ now: observedAt, results: sources, observations })).digest("hex");
  const snapshot = { version: 1, kind: "market_observations_not_calibrated_capacity",
    mode: "read_only", observedAt, sources, observations, digest };
  assert.doesNotThrow(() => verifySnapshot(snapshot));
  const report = summarize(snapshot);
  assert.equal(report.digest, digest);
  assert.equal(report.metrics.akashReportedAvailableGpusOnline, 0);
  assert.equal(report.publicSourcesHealthy, false);
  assert.equal(report.externalMarketContext.kind, "dated_external_market_context_not_capacity");
  assert.match(markdown(report), /Dated external market context/);
  assert.match(markdown(report), /not current supplier observations/);
});
