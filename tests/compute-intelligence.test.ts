import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareComputeAttraction, evaluateComputeForecast, forecastComputeNetwork, planComputePlacement,
  type ComputeRegion, type ComputeSnapshot,
} from "../src/compute-intelligence.js";

const region = (id: string, overrides: Partial<ComputeRegion> = {}): ComputeRegion => ({
  id, effectiveCapacity: 100, rootDemand: 20, capacityGrowth: 0,
  rootDemandGrowth: 0, sollandFactor: 0, generationLag: 1,
  attractionElasticity: 0, economicAttractionElasticity: 0, pricePerUnit: 1,
  ...overrides,
});

const snapshot = (regions: ComputeRegion[], access: ComputeSnapshot["access"] = []): ComputeSnapshot => ({
  version: 1, observedAt: "2026-10-31T00:00:00Z", unit: "quality-adjusted-cu/hour", periodDays: 1,
  evidence: { kind: "scenario", source: "deterministic-local-fixture" }, regions, access,
});

test("reports regional scarcity even with unused nominal global capacity", () => {
  const projection = forecastComputeNetwork(snapshot([
    region("a", { effectiveCapacity: 10, rootDemand: 30 }),
    region("b", { effectiveCapacity: 100, rootDemand: 0 }),
  ]), 1).periods[0]!;
  assert.equal(projection.totalDemand, 30);
  assert.equal(projection.totalServed, 10);
  assert.equal(projection.totalUnmet, 20);
  assert.equal(projection.regions.find(r => r.id === "b")!.utilization, 0);
});

test("allocates cross-region work without double counting a remote provider", () => {
  const projection = forecastComputeNetwork(snapshot([
    region("a", { effectiveCapacity: 10, rootDemand: 30 }),
    region("b", { effectiveCapacity: 20, rootDemand: 20 }),
    region("c", { effectiveCapacity: 10, rootDemand: 0 }),
  ], [
    { origin: "a", provider: "b", fraction: 1, latencyMs: 20, transferPricePerUnit: 0 },
    { origin: "a", provider: "c", fraction: 1, latencyMs: 30, transferPricePerUnit: 0 },
  ]), 1).periods[0]!;
  assert.equal(projection.totalServed, 40);
  assert.equal(projection.totalUnmet, 10);
  for (const r of projection.regions) {
    assert.ok(projection.allocations.filter(a => a.provider === r.id).reduce((s, a) => s + a.units, 0) <= r.capacity);
  }
  assert.ok(projection.allocations.some(a => a.origin === "a" && a.provider === "c" && a.units === 10));
});

test("recursive work is generated only from served compute, with an explicit generation lag", () => {
  const forecast = forecastComputeNetwork(snapshot([
    region("a", { rootDemand: 10, effectiveCapacity: 20, sollandFactor: 2, generationLag: 2 }),
  ]), 4);
  assert.deepEqual(forecast.periods.map(p => p.totalDemand), [10, 10, 30, 30]);
  assert.deepEqual(forecast.periods.map(p => p.totalServed), [10, 10, 20, 20]);
  assert.deepEqual(forecast.periods.map(p => p.totalUnmet), [0, 0, 10, 10]);
});

test("preserves the causal R_S = bpc decomposition and rejects inconsistent evidence", () => {
  const measured = region("a", { rootDemand: 10, sollandFactor: 0.6,
    sollandDecomposition: { b: 2, p: 0.6, c: 0.5 } });
  assert.equal(forecastComputeNetwork(snapshot([measured]), 2).periods[1]!.regions[0]!.recursiveDemand, 6);
  assert.throws(() => forecastComputeNetwork(snapshot([{ ...measured,
    sollandDecomposition: { b: 2, p: 0.5, c: 0.5 },
  }]), 2), /R_S = b \* p \* c/);
  assert.throws(() => forecastComputeNetwork(snapshot([{ ...measured,
    sollandDecomposition: { b: 2, p: 1.5, c: 0.5 },
  }]), 2), /sollandDecomposition.p/);
});

test("capacity attraction increases demand relative to the zero-attraction counterfactual", () => {
  const result = compareComputeAttraction(snapshot([
    region("a", { effectiveCapacity: 100, rootDemand: 40, capacityGrowth: 0.5, attractionElasticity: 1,
      economicAttractionElasticity: 2 }),
  ]), 3);
  assert.deepEqual(result.withAttraction.periods.map(p => p.totalDemand), [40, 60, 90]);
  assert.deepEqual(result.counterfactual.periods.map(p => p.totalDemand), [40, 40, 40]);
  assert.deepEqual(result.incrementalDemand, [0, 20, 50]);
  assert.equal(result.withAttraction.periods[2]!.regions[0]!.economicActivityIndex, 5.0625);
});

test("permits negative empirical attraction elasticities instead of assuming the hypothesis true", () => {
  const forecast = forecastComputeNetwork(snapshot([
    region("a", { rootDemand: 40, capacityGrowth: 0.5, attractionElasticity: -1,
      economicAttractionElasticity: -1 }),
  ]), 2);
  assert.ok(Math.abs(forecast.periods[1]!.regions[0]!.rootDemand - 40 / 1.5) < 1e-8);
  assert.ok(Math.abs(forecast.periods[1]!.regions[0]!.economicActivityIndex - 1 / 1.5) < 1e-8);
});

test("placement is priced only among explicit eligible regions and residual headroom", () => {
  const input = snapshot([
    region("no", { effectiveCapacity: 10, rootDemand: 0, pricePerUnit: 3 }),
    region("eu", { effectiveCapacity: 20, rootDemand: 0, pricePerUnit: 1 }),
    region("us", { effectiveCapacity: 100, rootDemand: 0, pricePerUnit: 0.1 }),
  ], [{ origin: "no", provider: "eu", fraction: 0.5, latencyMs: 40, transferPricePerUnit: 0.2 }]);
  const placed = planComputePlacement(input, { origin: "no", units: 5, allowedProviders: ["no", "eu"], maxLatencyMs: 50 });
  assert.equal(placed.provider, "eu");
  assert.equal(placed.estimatedTotalPrice, 6);
  assert.equal(placed.requiresAuthorization, true);
  assert.equal(placed.execution, "not_started");
  assert.equal(placed.candidates.find(c => c.provider === "us")!.reason, "provider_not_allowed");
  assert.equal(placed.candidates.find(c => c.provider === "no")!.reason, "feasible");
  assert.equal(planComputePlacement(input, { origin: "no", units: 5, maxLatencyMs: 10, maxUnitPrice: 1 }).status, "no_feasible_capacity");
  const saturatedLocal = snapshot([region("no", { effectiveCapacity: 10, rootDemand: 10 })]);
  assert.equal(planComputePlacement(saturatedLocal, { origin: "no", units: 1 }).candidates[0]!.reason, "insufficient_residual_capacity");
});

test("re-optimizes existing allocations when a cheaper placement requires workload movement", () => {
  const input = snapshot([
    region("no", { effectiveCapacity: 10, rootDemand: 9, pricePerUnit: 3 }),
    region("eu", { effectiveCapacity: 20, rootDemand: 0, pricePerUnit: 1 }),
  ], [{ origin: "no", provider: "eu", fraction: 0.5, latencyMs: 40, transferPricePerUnit: 0.2 }]);
  const result = planComputePlacement(input, { origin: "no", units: 5, allowedProviders: ["no", "eu"] });
  assert.equal(result.provider, "eu");
  assert.equal(result.candidates.find(c => c.provider === "eu")!.headroom, 1);
  assert.equal(result.candidates.find(c => c.provider === "eu")!.requiresReallocation, true);
  assert.ok(Math.abs(result.estimatedTotalPrice! - 13.2) < 1e-8);
});

test("price-optimal allocation can reroute locally served work to maximize total service", () => {
  const projection = forecastComputeNetwork(snapshot([
    region("a", { effectiveCapacity: 10, rootDemand: 10, pricePerUnit: 1 }),
    region("b", { effectiveCapacity: 10, rootDemand: 10, pricePerUnit: 2 }),
  ], [{ origin: "a", provider: "b", fraction: 1, latencyMs: 1, transferPricePerUnit: 0 }]), 1).periods[0]!;
  assert.equal(projection.totalServed, 20);
  assert.equal(projection.totalCost, 30);
});

test("invalid, incomplete, or misleading inputs fail rather than invent capacity", () => {
  assert.throws(() => forecastComputeNetwork(snapshot([region("a", { effectiveCapacity: NaN })]), 2), /effectiveCapacity/);
  assert.throws(() => forecastComputeNetwork(snapshot([region("a"), region("a")]), 2), /unique/);
  assert.throws(() => forecastComputeNetwork(snapshot([region("a"), region("b")], [
    { origin: "a", provider: "unknown", fraction: 1, latencyMs: 0, transferPricePerUnit: 0 },
  ]), 1), /known regions/);
  assert.throws(() => forecastComputeNetwork(snapshot([region("a", { generationLag: 1.5 })]), 2), /integer/);
  assert.throws(() => forecastComputeNetwork(snapshot([region("a")]), 91), /horizonPeriods/);
  assert.throws(() => planComputePlacement(snapshot([region("a")]), { origin: "unknown", units: 5 }), /unknown request origin/);
});

test("same evidence in a different region order produces the same source hash and projection", () => {
  const a = region("a", { rootDemand: 10 });
  const b = region("b", { rootDemand: 10 });
  const first = forecastComputeNetwork(snapshot([a, b]), 2);
  const second = forecastComputeNetwork(snapshot([b, a]), 2);
  assert.equal(first.snapshotHash, second.snapshotHash);
  assert.deepEqual(first.periods, second.periods);
  assert.equal(first.kind, "decision_support_only");
  assert.equal(first.sourceKind, "scenario");
});

test("scores independent holdout outcomes against a transparent persistence baseline", () => {
  const forecast = forecastComputeNetwork(snapshot([
    region("a", { effectiveCapacity: 10, rootDemand: 10, capacityGrowth: 0.1, rootDemandGrowth: 0.2 }),
  ]), 3);
  const report = evaluateComputeForecast(forecast, [
    { period: 2, unit: forecast.unit, source: "measurement-source", regions: [
      { id: "a", requestedDemand: 14, effectiveCapacity: 12, served: 12 },
    ] },
    { period: 1, unit: forecast.unit, source: "measurement-source", regions: [
      { id: "a", requestedDemand: 12, effectiveCapacity: 11, served: 11 },
    ] },
  ]);
  assert.equal(report.status, "holdout_error_report");
  assert.equal(report.observations, 2);
  assert.ok(Math.abs(report.demandMae - 0.2) < 1e-8);
  assert.ok(Math.abs(report.capacityMae - 0.05) < 1e-8);
  assert.ok(Math.abs(report.unmetMae - 0.15) < 1e-8);
  assert.equal(report.naivePersistenceDemandMae, 3);
  assert.ok(Math.abs(report.improvementVsPersistence! - (1 - 0.2 / 3)) < 1e-8);
  assert.deepEqual(report.details.map(d => d.period), [1, 2]);
});

test("rejects malformed or non-comparable holdout observations", () => {
  const forecast = forecastComputeNetwork(snapshot([region("a")]), 2);
  const valid = { period: 1, unit: forecast.unit, source: "external-meter", regions: [
    { id: "a", requestedDemand: 20, effectiveCapacity: 100, served: 20 },
  ] };
  assert.throws(() => evaluateComputeForecast(forecast, []), /observations required/);
  assert.throws(() => evaluateComputeForecast(forecast, [{ ...valid, period: 0 }]), /after baseline/);
  assert.throws(() => evaluateComputeForecast(forecast, [{ ...valid, unit: "tokens" }]), /same compute unit/);
  assert.throws(() => evaluateComputeForecast(forecast, [{ ...valid, source: "" }]), /source/);
  assert.throws(() => evaluateComputeForecast(forecast, [{ ...valid, regions: [
    { id: "unknown", requestedDemand: 20, effectiveCapacity: 100, served: 20 },
  ] }]), /unknown or duplicate/);
  assert.throws(() => evaluateComputeForecast(forecast, [{ ...valid, regions: [
    { id: "a", requestedDemand: 20, effectiveCapacity: 100, served: 30 },
  ] }]), /served/);
});
