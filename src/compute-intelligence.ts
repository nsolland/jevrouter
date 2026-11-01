import { createHash } from "node:crypto";

/** A normalized compute unit is workload-specific; never mix tokens, FLOPs, or joules. */
export interface ComputeRegion {
  id: string;
  effectiveCapacity: number;
  /** Root demand only: excludes work recursively created by completed compute. */
  rootDemand: number;
  capacityGrowth: number;
  rootDemandGrowth: number;
  /** Compute-weighted causal reproduction factor, R_S = b * p * c. */
  sollandFactor: number;
  /** Optional independently measurable decomposition of R_S; must agree with sollandFactor. */
  sollandDecomposition?: { b: number; p: number; c: number };
  generationLag: number;
  /** Lagged capacity-to-root-demand elasticity, eta_r. */
  attractionElasticity: number;
  /** Lagged capacity-to-economic-activity elasticity, mu_r. */
  economicAttractionElasticity: number;
  pricePerUnit: number;
}

export interface ComputeAccess {
  origin: string;
  provider: string;
  /** A_ij in [0, 1]. Remote service is denied when no explicit access edge exists. */
  fraction: number;
  latencyMs: number;
  transferPricePerUnit: number;
}

export interface ComputeSnapshot {
  version: 1;
  observedAt: string;
  unit: string;
  periodDays: number;
  evidence: { kind: "observed" | "scenario"; source: string };
  regions: ComputeRegion[];
  access: ComputeAccess[];
}

export interface ComputeAllocation {
  origin: string;
  provider: string;
  units: number;
  unitPrice: number;
}

export interface RegionProjection {
  id: string;
  capacity: number;
  rootDemand: number;
  recursiveDemand: number;
  totalDemand: number;
  served: number;
  unmet: number;
  utilization: number;
  economicActivityIndex: number;
}

export interface ComputePeriod {
  period: number;
  regions: RegionProjection[];
  allocations: ComputeAllocation[];
  totalDemand: number;
  totalServed: number;
  totalUnmet: number;
  totalCost: number;
}

export interface ComputeForecast {
  kind: "decision_support_only";
  model: "solland-regional-network-v1";
  sourceKind: "observed" | "scenario";
  source: string;
  snapshotHash: string;
  unit: string;
  periodDays: number;
  periods: ComputePeriod[];
  assumptions: string[];
}

export interface ObservedComputePeriod {
  period: number;
  unit: string;
  source: string;
  regions: Array<{ id: string; requestedDemand: number; effectiveCapacity: number; served: number }>;
}

export interface ComputePlacement {
  status: "candidate" | "no_feasible_capacity";
  provider: string | null;
  estimatedUnitPrice: number | null;
  estimatedTotalPrice: number | null;
  candidates: Array<{ provider: string; feasible: boolean; reason: string; headroom: number; requiresReallocation: boolean; marginalTotalCost: number | null; unitPrice: number | null; latencyMs: number | null }>;
  period: number;
  sourceKind: "observed" | "scenario";
  requiresAuthorization: true;
  execution: "not_started";
}

const EPS = 1e-9;
const MAX_REGIONS = 64;
const MAX_PERIODS = 90;

function checkNumber(value: number, label: string, min: number, max = Infinity): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be finite and between ${min} and ${max}`);
  }
}

export function validateComputeSnapshot(snapshot: ComputeSnapshot): void {
  if (!snapshot || snapshot.version !== 1) throw new Error("unsupported compute snapshot version");
  if (!snapshot.observedAt || !Number.isFinite(Date.parse(snapshot.observedAt))) throw new Error("invalid observedAt");
  if (!snapshot.unit?.trim()) throw new Error("missing normalized compute unit");
  checkNumber(snapshot.periodDays, "periodDays", EPS);
  if (!snapshot.evidence || !["scenario", "observed"].includes(snapshot.evidence.kind) || !snapshot.evidence.source?.trim()) {
    throw new Error("snapshot requires evidence kind and source");
  }
  if (!Array.isArray(snapshot.regions) || snapshot.regions.length < 1 || snapshot.regions.length > MAX_REGIONS) {
    throw new Error(`regions must contain 1..${MAX_REGIONS} entries`);
  }
  const ids = new Set<string>();
  for (const region of snapshot.regions) {
    if (!region.id?.trim() || ids.has(region.id)) throw new Error("region ids must be unique and nonempty");
    ids.add(region.id);
    checkNumber(region.effectiveCapacity, `${region.id}.effectiveCapacity`, EPS);
    checkNumber(region.rootDemand, `${region.id}.rootDemand`, 0);
    checkNumber(region.capacityGrowth, `${region.id}.capacityGrowth`, -0.999999);
    checkNumber(region.rootDemandGrowth, `${region.id}.rootDemandGrowth`, -0.999999);
    checkNumber(region.sollandFactor, `${region.id}.sollandFactor`, 0);
    if (region.sollandDecomposition !== undefined) {
      if (!region.sollandDecomposition || typeof region.sollandDecomposition !== "object") {
        throw new Error(`${region.id}.sollandDecomposition must be a b/p/c object`);
      }
      const { b, p, c } = region.sollandDecomposition;
      checkNumber(b, `${region.id}.sollandDecomposition.b`, 0);
      checkNumber(p, `${region.id}.sollandDecomposition.p`, 0, 1);
      checkNumber(c, `${region.id}.sollandDecomposition.c`, 0);
      const product = b * p * c;
      if (!Number.isFinite(product) || Math.abs(product - region.sollandFactor) > 1e-9 * Math.max(1, region.sollandFactor)) {
        throw new Error(`${region.id}.sollandDecomposition must satisfy R_S = b * p * c`);
      }
    }
    checkNumber(region.generationLag, `${region.id}.generationLag`, 1, MAX_PERIODS);
    if (!Number.isInteger(region.generationLag)) throw new Error("generationLag must be an integer number of periods");
    // Negative measured elasticities are allowed: the attraction hypothesis must be falsifiable.
    checkNumber(region.attractionElasticity, `${region.id}.attractionElasticity`, -Number.MAX_VALUE);
    checkNumber(region.economicAttractionElasticity, `${region.id}.economicAttractionElasticity`, -Number.MAX_VALUE);
    checkNumber(region.pricePerUnit, `${region.id}.pricePerUnit`, 0);
  }
  if (!Array.isArray(snapshot.access) || snapshot.access.length > snapshot.regions.length * (snapshot.regions.length - 1)) {
    throw new Error("access must be an array of at most one directed edge per distinct region pair");
  }
  const edges = new Set<string>();
  for (const access of snapshot.access) {
    if (!ids.has(access.origin) || !ids.has(access.provider) || access.origin === access.provider) {
      throw new Error("access must refer to two different known regions");
    }
    const key = `${access.origin}\u0000${access.provider}`;
    if (edges.has(key)) throw new Error("duplicate access edge");
    edges.add(key);
    checkNumber(access.fraction, "access.fraction", 0, 1);
    checkNumber(access.latencyMs, "access.latencyMs", 0);
    checkNumber(access.transferPricePerUnit, "access.transferPricePerUnit", 0);
  }
}

type FlowEdge = { to: number; reverse: number; capacity: number; cost: number };

function allocate(
  regions: ComputeRegion[], demand: number[], capacity: number[], access: ComputeAccess[],
  reservation?: { origin: string; provider: string; units: number },
) {
  const n = regions.length;
  const size = 2 * n + 2;
  const source = 0;
  const sink = size - 1;
  const graph: FlowEdge[][] = Array.from({ length: size }, () => []);
  const addEdge = (from: number, to: number, cap: number, cost: number): FlowEdge => {
    const forward: FlowEdge = { to, reverse: graph[to]!.length, capacity: cap, cost };
    const backward: FlowEdge = { to: from, reverse: graph[from]!.length, capacity: 0, cost: -cost };
    graph[from]!.push(forward);
    graph[to]!.push(backward);
    return forward;
  };
  const connections: Array<{ origin: number; provider: number; edge: FlowEdge; initial: number; unitPrice: number }> = [];
  for (let i = 0; i < n; i++) {
    addEdge(source, 1 + i, demand[i]!, 0);
    addEdge(1 + n + i, sink, Math.max(0, capacity[i]! - (reservation?.provider === regions[i]!.id ? reservation.units : 0)), 0);
  }
  const indices = new Map(regions.map((r, i) => [r.id, i]));
  const allAccess = [
    ...regions.map(r => ({ origin: r.id, provider: r.id, fraction: 1, latencyMs: 0, transferPricePerUnit: 0 })),
    ...access,
  ].sort((a, b) => a.origin.localeCompare(b.origin) || a.provider.localeCompare(b.provider));
  for (const route of allAccess) {
    const i = indices.get(route.origin)!;
    const j = indices.get(route.provider)!;
    const cap = Math.max(0, route.fraction * capacity[j]! -
      (reservation?.origin === route.origin && reservation.provider === route.provider ? reservation.units : 0));
    const unitPrice = regions[j]!.pricePerUnit + route.transferPricePerUnit;
    if (!Number.isFinite(unitPrice)) throw new Error("combined compute and transfer price overflow");
    const edge = addEdge(1 + i, 1 + n + j, cap, unitPrice);
    connections.push({ origin: i, provider: j, edge, initial: cap, unitPrice });
  }
  // Successive shortest augmenting paths: maximum feasible service, minimum
  // price among maximum-flow allocations. Residual edges permit reallocation.
  for (;;) {
    const distance = Array<number>(size).fill(Infinity);
    const previousNode = Array<number>(size).fill(-1);
    const previousEdge = Array<number>(size).fill(-1);
    distance[source] = 0;
    for (let iteration = 0; iteration < size - 1; iteration++) {
      let changed = false;
      for (let u = 0; u < size; u++) {
        if (!Number.isFinite(distance[u])) continue;
        for (let e = 0; e < graph[u]!.length; e++) {
          const edge = graph[u]![e]!;
          const next = distance[u]! + edge.cost;
          if (edge.capacity > EPS && next < distance[edge.to]! - EPS) {
            distance[edge.to] = next;
            previousNode[edge.to] = u;
            previousEdge[edge.to] = e;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    if (previousNode[sink] === -1) break;
    let amount = Infinity;
    for (let v = sink; v !== source; v = previousNode[v]!) {
      amount = Math.min(amount, graph[previousNode[v]!]![previousEdge[v]!]!.capacity);
    }
    if (!Number.isFinite(amount) || amount <= EPS) break;
    for (let v = sink; v !== source; v = previousNode[v]!) {
      const edge = graph[previousNode[v]!]![previousEdge[v]!]!;
      edge.capacity -= amount;
      graph[v]![edge.reverse]!.capacity += amount;
    }
  }
  const allocations: ComputeAllocation[] = connections
    .map(({ origin, provider, edge, initial, unitPrice }) => ({
      origin: regions[origin]!.id, provider: regions[provider]!.id,
      units: Math.max(0, initial - edge.capacity), unitPrice,
    }))
    .filter(a => a.units > EPS);
  const served = regions.map(r => allocations.filter(a => a.origin === r.id).reduce((v, a) => v + a.units, 0));
  return { allocations, served, totalCost: allocations.reduce((v, a) => v + a.units * a.unitPrice, 0) };
}

export function forecastComputeNetwork(snapshot: ComputeSnapshot, horizonPeriods: number): ComputeForecast {
  validateComputeSnapshot(snapshot);
  if (!Number.isInteger(horizonPeriods) || horizonPeriods < 1 || horizonPeriods > MAX_PERIODS) {
    throw new Error(`horizonPeriods must be an integer between 1 and ${MAX_PERIODS}`);
  }
  const regions = [...snapshot.regions].sort((a, b) => a.id.localeCompare(b.id));
  const capacity = regions.map(r => r.effectiveCapacity);
  const roots = regions.map(r => r.rootDemand);
  const economicIndex = regions.map(() => 1);
  const futureRecursive = Array.from({ length: horizonPeriods }, () => regions.map(() => 0));
  const periods: ComputePeriod[] = [];
  for (let period = 0; period < horizonPeriods; period++) {
    const recursive = futureRecursive[period]!;
    const demand = regions.map((_, i) => roots[i]! + recursive[i]!);
    if (!demand.every(Number.isFinite)) throw new Error("forecast demand overflow; shorten horizon or check scenario parameters");
    const { allocations, served, totalCost } = allocate(regions, demand, capacity, snapshot.access);
    const projected = regions.map((r, i): RegionProjection => ({
      id: r.id, capacity: capacity[i]!, rootDemand: roots[i]!, recursiveDemand: recursive[i]!,
      totalDemand: demand[i]!, served: served[i]!, unmet: Math.max(0, demand[i]! - served[i]!),
      utilization: Math.min(1, allocations.filter(a => a.provider === r.id).reduce((v, a) => v + a.units, 0) / capacity[i]!),
      economicActivityIndex: economicIndex[i]!,
    }));
    const totalDemand = demand.reduce((a, b) => a + b, 0);
    const totalServed = served.reduce((a, b) => a + b, 0);
    if (![totalDemand, totalServed, totalCost].every(Number.isFinite)) {
      throw new Error("forecast aggregate overflow; rescale compute units or prices");
    }
    periods.push({ period, regions: projected, allocations, totalDemand, totalServed,
      totalUnmet: Math.max(0, totalDemand - totalServed), totalCost });
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i]!;
      const descendantPeriod = period + r.generationLag;
      if (descendantPeriod < horizonPeriods) futureRecursive[descendantPeriod]![i] += served[i]! * r.sollandFactor;
      const capacityMultiplier = 1 + r.capacityGrowth;
      roots[i] = roots[i]! * (1 + r.rootDemandGrowth) * Math.pow(capacityMultiplier, r.attractionElasticity);
      capacity[i] = capacity[i]! * capacityMultiplier;
      economicIndex[i] = economicIndex[i]! * Math.pow(capacityMultiplier, r.economicAttractionElasticity);
      if (![roots[i], capacity[i], economicIndex[i]].every(Number.isFinite)) throw new Error("forecast overflow; shorten horizon or check scenario parameters");
    }
  }
  const canonical = { ...snapshot, regions, access: [...snapshot.access].sort((a, b) => a.origin.localeCompare(b.origin) || a.provider.localeCompare(b.provider)) };
  return {
    kind: "decision_support_only", model: "solland-regional-network-v1",
    sourceKind: snapshot.evidence.kind, source: snapshot.evidence.source,
    snapshotHash: createHash("sha256").update(JSON.stringify(canonical)).digest("hex"),
    unit: snapshot.unit, periodDays: snapshot.periodDays, periods,
    assumptions: [
      "One forecast period represents one causal generation interval unit; each region's generationLag is explicit.",
      "Root demand and recursively generated demand are separate to avoid double counting.",
      "Capacity attraction is a lagged scenario elasticity, not proven causal evidence.",
      "Economic activity is a dimensionless index, not a currency or employment forecast.",
      "Access edges encode feasible cross-region service; absence means inaccessible.",
      "Provider prices and network eligibility are held constant over the projection.",
      "Unserved demand is reported as unmet, not silently carried into the next period.",
    ],
  };
}

/** Holdout scoring is descriptive; it never turns scenario assumptions into causal evidence. */
export function evaluateComputeForecast(forecast: ComputeForecast, observations: ObservedComputePeriod[]) {
  if (!Array.isArray(observations) || observations.length === 0) throw new Error("holdout observations required");
  const first = forecast.periods[0]!;
  const initial = new Map(first.regions.map(r => [r.id, r]));
  const seen = new Set<number>();
  let demandError = 0;
  let capacityError = 0;
  let unmetError = 0;
  let naiveDemandError = 0;
  let samples = 0;
  const details: Array<{ period: number; id: string; demandAbsoluteError: number; capacityAbsoluteError: number; unmetAbsoluteError: number }> = [];
  for (const observed of observations) {
    if (!Number.isInteger(observed.period) || observed.period < 1 || observed.period >= forecast.periods.length || seen.has(observed.period)) {
      throw new Error("holdout periods must be unique and strictly within forecast horizon after baseline");
    }
    seen.add(observed.period);
    if (observed.unit !== forecast.unit || !observed.source?.trim()) throw new Error("holdout requires same compute unit and a source");
    const projected = forecast.periods[observed.period]!;
    if (!Array.isArray(observed.regions) || observed.regions.length !== projected.regions.length) {
      throw new Error("holdout must include every projected region once");
    }
    const actualIds = new Set<string>();
    for (const actual of observed.regions) {
      const prediction = projected.regions.find(r => r.id === actual.id);
      if (!prediction || actualIds.has(actual.id)) throw new Error("holdout contains unknown or duplicate region");
      actualIds.add(actual.id);
      checkNumber(actual.requestedDemand, "observed requestedDemand", 0);
      checkNumber(actual.effectiveCapacity, "observed effectiveCapacity", EPS);
      checkNumber(actual.served, "observed served", 0, actual.requestedDemand);
      const dError = Math.abs(prediction.totalDemand - actual.requestedDemand);
      const cError = Math.abs(prediction.capacity - actual.effectiveCapacity);
      const uError = Math.abs(prediction.unmet - Math.max(0, actual.requestedDemand - actual.served));
      demandError += dError;
      capacityError += cError;
      unmetError += uError;
      naiveDemandError += Math.abs(initial.get(actual.id)!.totalDemand - actual.requestedDemand);
      samples++;
      details.push({ period: observed.period, id: actual.id, demandAbsoluteError: dError, capacityAbsoluteError: cError, unmetAbsoluteError: uError });
    }
  }
  return {
    status: "holdout_error_report" as const,
    model: forecast.model,
    snapshotHash: forecast.snapshotHash,
    forecastSource: forecast.source,
    observationSources: [...new Set(observations.map(o => o.source))].sort(),
    observations: samples,
    demandMae: demandError / samples,
    capacityMae: capacityError / samples,
    unmetMae: unmetError / samples,
    naivePersistenceDemandMae: naiveDemandError / samples,
    improvementVsPersistence: naiveDemandError === 0 ? null : (naiveDemandError - demandError) / naiveDemandError,
    details: details.sort((a, b) => a.period - b.period || a.id.localeCompare(b.id)),
    caveat: "Holdout error does not establish causality. Input provenance and independent measurement must be verified.",
  };
}

export function compareComputeAttraction(snapshot: ComputeSnapshot, horizonPeriods: number) {
  const withAttraction = forecastComputeNetwork(snapshot, horizonPeriods);
  const counterfactual = forecastComputeNetwork({
    ...snapshot, regions: snapshot.regions.map(r => ({ ...r, attractionElasticity: 0, economicAttractionElasticity: 0 })),
  }, horizonPeriods);
  return {
    withAttraction, counterfactual,
    incrementalDemand: withAttraction.periods.map((p, i) => p.totalDemand - counterfactual.periods[i]!.totalDemand),
    incrementalUnmet: withAttraction.periods.map((p, i) => p.totalUnmet - counterfactual.periods[i]!.totalUnmet),
  };
}

export function planComputePlacement(
  snapshot: ComputeSnapshot,
  request: { origin: string; units: number; period?: number; allowedProviders?: string[]; maxLatencyMs?: number; maxUnitPrice?: number },
): ComputePlacement {
  validateComputeSnapshot(snapshot);
  if (!snapshot.regions.some(r => r.id === request.origin)) throw new Error("unknown request origin");
  checkNumber(request.units, "request.units", EPS);
  if (request.maxLatencyMs !== undefined) checkNumber(request.maxLatencyMs, "maxLatencyMs", 0);
  if (request.maxUnitPrice !== undefined) checkNumber(request.maxUnitPrice, "maxUnitPrice", 0);
  const period = request.period ?? 0;
  const projection = forecastComputeNetwork(snapshot, period + 1).periods[period]!;
  const allow = request.allowedProviders ? new Set(request.allowedProviders) : null;
  const sortedRegions = [...snapshot.regions].sort((a, b) => a.id.localeCompare(b.id));
  const originalDemand = projection.regions.map(r => r.totalDemand);
  const originalCapacity = projection.regions.map(r => r.capacity);
  const candidates = snapshot.regions.map(region => {
    const provider = projection.regions.find(r => r.id === region.id)!;
    const route = request.origin === region.id
      ? { fraction: 1, latencyMs: 0, transferPricePerUnit: 0 }
      : snapshot.access.find(a => a.origin === request.origin && a.provider === region.id);
    const previouslyAllocated = projection.allocations.filter(a => a.provider === region.id).reduce((v, a) => v + a.units, 0);
    const routeAllocated = projection.allocations.filter(a => a.origin === request.origin && a.provider === region.id).reduce((v, a) => v + a.units, 0);
    const headroom = route ? Math.max(0, Math.min(provider.capacity - previouslyAllocated, route.fraction * provider.capacity - routeAllocated)) : 0;
    const unitPrice = route ? region.pricePerUnit + route.transferPricePerUnit : null;
    const inputReason = allow && !allow.has(region.id) ? "provider_not_allowed"
      : !route || route.fraction === 0 ? "region_inaccessible"
      : request.maxLatencyMs !== undefined && route.latencyMs > request.maxLatencyMs ? "latency_limit"
      : request.maxUnitPrice !== undefined && unitPrice! > request.maxUnitPrice ? "price_limit"
      : request.units > provider.capacity + EPS || request.units > route.fraction * provider.capacity + EPS
        ? "insufficient_residual_capacity" : null;
    // Reserve the requested service and re-optimize old work. This catches
    // usable capacity that a fixed residual snapshot would miss, without
    // sacrificing any previously deliverable work.
    const reallocated = !inputReason ? allocate(sortedRegions, originalDemand, originalCapacity, snapshot.access,
      { origin: request.origin, provider: region.id, units: request.units }) : null;
    const reallocatedService = reallocated?.served.reduce((a, b) => a + b, 0) ?? 0;
    const feasible = !inputReason && reallocatedService + EPS >= projection.totalServed;
    const reason = inputReason ?? (feasible ? "feasible" : "insufficient_residual_capacity");
    const marginalTotalCost = feasible ? reallocated!.totalCost + request.units * unitPrice! - projection.totalCost : null;
    return {
      provider: region.id, feasible, reason, headroom,
      requiresReallocation: feasible && headroom + EPS < request.units,
      marginalTotalCost, unitPrice, latencyMs: route?.latencyMs ?? null,
    };
  }).sort((a, b) => a.provider.localeCompare(b.provider));
  const best = candidates.filter(c => c.feasible).sort((a, b) =>
    a.marginalTotalCost! - b.marginalTotalCost! || a.latencyMs! - b.latencyMs! || a.provider.localeCompare(b.provider))[0];
  return {
    status: best ? "candidate" : "no_feasible_capacity", provider: best?.provider ?? null,
    estimatedUnitPrice: best?.unitPrice ?? null,
    estimatedTotalPrice: best?.marginalTotalCost ?? null,
    candidates, period, sourceKind: snapshot.evidence.kind,
    requiresAuthorization: true, execution: "not_started",
  };
}
