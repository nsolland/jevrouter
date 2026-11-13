/** Read-only scenario comparison for task-qualified API vs reserved GPU capacity.
 * The provider estimates are caller-supplied; no marketplace lookup or execution.
 */
function positive(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    throw new TypeError(field + ' must be a finite positive number');
  return value;
}
function probability(value, field) {
  positive(value, field);
  if (value > 1) throw new RangeError(field + ' cannot exceed 1');
  return value;
}
function optionalNonnegative(value, field) {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new TypeError(field + ' must be finite and nonnegative');
  return value;
}

/**
 * Input: monthlyAcceptedTasks, tokensPerAttempt, api {usdPerMillionTokens,
 * acceptanceRate, latencyMs?}, reserved {gpuCount, usdPerGpuHour,
 * billableHours, measuredTokensPerSecondPerGpu, utilization, acceptanceRate,
 * operatingUsd?, latencyMs?}, minAcceptanceRate?, maxLatencyMs?.
 * Throughput must come from workload-matched benchmarks, not GPU marketing specs.
 * Returns non-authorizing comparisons; insufficient evidence yields abstain.
 */
export function compareCapacityEconomics(input) {
  if (!input || typeof input !== 'object') throw new TypeError('input required');
  const {api, reserved} = input;
  if (!api || !reserved) return {status:'abstain',reason:'missing_api_or_reserved'};
  const tasks = positive(input.monthlyAcceptedTasks, 'monthlyAcceptedTasks');
  const tokens = positive(input.tokensPerAttempt, 'tokensPerAttempt');
  const ar = probability(api.acceptanceRate, 'api.acceptanceRate');
  const gr = probability(reserved.acceptanceRate, 'reserved.acceptanceRate');
  const price = positive(api.usdPerMillionTokens, 'api.usdPerMillionTokens');
  const gpus = positive(reserved.gpuCount, 'reserved.gpuCount');
  const gpuHourly = positive(reserved.usdPerGpuHour, 'reserved.usdPerGpuHour');
  const hours = positive(reserved.billableHours, 'reserved.billableHours');
  const throughput = positive(reserved.measuredTokensPerSecondPerGpu, 'reserved.measuredTokensPerSecondPerGpu');
  const utilization = probability(reserved.utilization, 'reserved.utilization');
  const ops = optionalNonnegative(reserved.operatingUsd, 'reserved.operatingUsd');
  const minQuality = input.minAcceptanceRate === undefined ? 0 : optionalNonnegative(input.minAcceptanceRate, 'minAcceptanceRate');
  if (minQuality > 1) throw new RangeError('minAcceptanceRate cannot exceed 1');
  const deadline = input.maxLatencyMs === undefined ? Infinity : positive(input.maxLatencyMs, 'maxLatencyMs');
  const apiLatency = api.latencyMs === undefined ? Infinity : positive(api.latencyMs, 'api.latencyMs');
  const gpuLatency = reserved.latencyMs === undefined ? Infinity : positive(reserved.latencyMs, 'reserved.latencyMs');
  const apiQualified = ar >= minQuality && apiLatency <= deadline;
  const gpuQualified = gr >= minQuality && gpuLatency <= deadline;
  const apiCost = tasks * tokens / ar / 1e6 * price;
  const gpuCost = gpus * gpuHourly * hours + ops;
  const gpuCapacity = gpus * throughput * hours * 3600 * utilization;
  const requiredGpuTokens = tasks * tokens / gr;
  const capacityQualified = gpuCapacity >= requiredGpuTokens;
  const options = [
    {name:'api', qualified:apiQualified, costUsd:apiCost, costPerAcceptedTaskUsd:apiCost/tasks},
    {name:'reserved', qualified:gpuQualified && capacityQualified, costUsd:gpuCost, costPerAcceptedTaskUsd:gpuCost/tasks,
      capacityTokens:gpuCapacity, requiredTokens:requiredGpuTokens}
  ];
  const eligible=options.filter(x=>x.qualified).sort((a,b)=>a.costUsd-b.costUsd);
  return {status:eligible.length?'estimate':'abstain',recommended:eligible[0]?.name ?? null,
    reason:eligible.length?null:'no_qualified_option',monthlyAcceptedTasks:tasks,options,
    assumptions:'Caller-supplied, workload-matched rates. No live availability, SLA, quality proof, or execution authorization.'};
}
