import {createHash} from 'node:crypto';
import {compareCapacityEconomics} from './capacity-economics.mjs';

/** Combine source-labelled Scout prices with independently measured task benchmarks.
 * Never treats supplier inventory/catalog as guaranteed execution capacity.
 */
export function compareScoutWorkload(snapshot, workload) {
  const abstain = (reason) => ({status:'abstain',reason,authority:'analysis_only'});
  if (!snapshot || snapshot.version !== 1 || snapshot.kind !== 'market_observations_not_calibrated_capacity' || snapshot.mode !== 'read_only' ||
      !Array.isArray(snapshot.sources) || !Array.isArray(snapshot.observations) || !snapshot.digest)
    return abstain('invalid_scout_snapshot');
  const digest = createHash('sha256').update(JSON.stringify({now:snapshot.observedAt,results:snapshot.sources,observations:snapshot.observations})).digest('hex');
  if (digest !== snapshot.digest) return abstain('scout_digest_mismatch');
  if (!workload || workload.evidenceKind !== 'independently_measured' || !workload.evidenceId ||
      !Number.isInteger(workload.sampleSize) || workload.sampleSize < 30)
    return abstain('missing_independent_workload_benchmark');
  const pick = (spec,kind) => {
    if (!spec || typeof spec.source !== 'string' || typeof spec.reference !== 'string') return null;
    const matches = snapshot.observations.filter(o => o.source === spec.source && o.reference === spec.reference && o.kind === kind);
    const source = snapshot.sources.find(s => s.source === spec.source);
    return matches.length === 1 && source?.status === 'ok' ? matches[0] : null;
  };
  const api = pick(workload.api,'model_catalog');
  const gpu = pick(workload.reserved,'gpu_offer');
  if (!api || !gpu) return abstain('missing_healthy_exact_price_listing');
  if (gpu.availability !== true || gpu.capacityBasis !== 'offer_quantity' ||
      !Number.isInteger(gpu.availableGpus) || gpu.availableGpus < workload.reserved.gpuCount)
    return abstain('gpu_inventory_not_confirmed');
  const prompt = workload.inputTokensPerAttempt, output = workload.outputTokensPerAttempt;
  if (![prompt,output].every(x=>typeof x === 'number' && Number.isFinite(x) && x >= 0) || prompt + output <= 0)
    return abstain('missing_token_mix');
  const pIn = api.priceUsdPerMillionInputTokens, pOut = api.priceUsdPerMillionOutputTokens;
  if (![pIn,pOut,gpu.priceUsdPerGpuHour].every(x=>typeof x==='number' && Number.isFinite(x) && x > 0))
    return abstain('missing_nonzero_supplier_prices');
  if (!workload.api || !workload.reserved || !workload.reserved.throughputEvidenceId || !workload.api.outcomeEvidenceId || !workload.reserved.outcomeEvidenceId)
    return abstain('missing_outcome_or_throughput_evidence');
  try {
    const result = compareCapacityEconomics({
      monthlyAcceptedTasks:workload.monthlyAcceptedTasks,
      tokensPerAttempt:prompt+output,
      minAcceptanceRate:workload.minAcceptanceRate,
      maxLatencyMs:workload.maxLatencyMs,
      api:{usdPerMillionTokens:(pIn*prompt+pOut*output)/(prompt+output),
        acceptanceRate:workload.api.acceptanceRate,latencyMs:workload.api.p95LatencyMs},
      reserved:{gpuCount:workload.reserved.gpuCount,usdPerGpuHour:gpu.priceUsdPerGpuHour,
        billableHours:workload.reserved.billableHours,
        measuredTokensPerSecondPerGpu:workload.reserved.measuredTokensPerSecondPerGpu,
        utilization:workload.reserved.utilization,
        acceptanceRate:workload.reserved.acceptanceRate,
        latencyMs:workload.reserved.p95LatencyMs,operatingUsd:workload.reserved.operatingUsd}
    });
    return {...result,authority:'analysis_only', evidence:{scoutDigest:snapshot.digest,
      workloadEvidenceId:workload.evidenceId,throughputEvidenceId:workload.reserved.throughputEvidenceId,
      apiOutcomeEvidenceId:workload.api.outcomeEvidenceId,gpuOutcomeEvidenceId:workload.reserved.outcomeEvidenceId,
      apiReference:api.reference,gpuReference:gpu.reference},
      caution:'Supplier listing is not reservation, guaranteed capacity, or proven production cost saving.'};
  } catch { return abstain('invalid_benchmark_or_economic_inputs'); }
}
