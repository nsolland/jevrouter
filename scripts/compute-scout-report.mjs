#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const flags = new Map(process.argv.slice(2).flatMap((value, index, values) =>
  value.startsWith("--") ? [[value, values[index + 1]]] : []));

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function verifySnapshot(snapshot) {
  if (snapshot?.version !== 1 || snapshot.kind !== "market_observations_not_calibrated_capacity" || snapshot.mode !== "read_only" ||
      !Array.isArray(snapshot.sources) || !Array.isArray(snapshot.observations)) throw new Error("Invalid Compute Scout snapshot");
  if (digest({ now: snapshot.observedAt, results: snapshot.sources, observations: snapshot.observations }) !== snapshot.digest) {
    throw new Error("Compute Scout snapshot digest does not match source observations");
  }
  return snapshot;
}

const comparable = status => status === "ok" || status === "partial";
const identity = observation => [observation.source, observation.kind, observation.reference].join("\u001f");
const measures = observation => ({
  availability: observation.availability, availableGpus: observation.availableGpus,
  priceUsdPerGpuHour: observation.priceUsdPerGpuHour,
  priceUsdPerMillionInputTokens: observation.priceUsdPerMillionInputTokens,
  priceUsdPerMillionOutputTokens: observation.priceUsdPerMillionOutputTokens,
});

export function summarize(current, previous = null) {
  verifySnapshot(current);
  if (previous) verifySnapshot(previous);
  const oldStatus = new Map((previous?.sources ?? []).map(s => [s.source, s.status]));
  const old = new Map((previous?.observations ?? []).map(o => [identity(o), o]));
  const now = new Map(current.observations.map(o => [identity(o), o]));
  const bySource = current.sources.map(source => {
    const priorOk = comparable(oldStatus.get(source.source));
    const currentOk = comparable(source.status);
    const paired = previous && priorOk && currentOk;
    const inCurrent = [...now.values()].filter(o => o.source === source.source);
    const inPrevious = [...old.values()].filter(o => o.source === source.source);
    return {
      source: source.source, status: source.status, records: source.records,
      comparison: !previous ? "first_observation" : paired ? "comparable_listing_changes" : "unavailable",
      newListings: paired ? inCurrent.filter(o => !old.has(identity(o))).length : null,
      notObservedAgain: paired ? inPrevious.filter(o => !now.has(identity(o))).length : null,
      changedMeasures: paired ? inCurrent.filter(o => old.has(identity(o)) &&
        JSON.stringify(measures(o)) !== JSON.stringify(measures(old.get(identity(o))))).length : null,
    };
  });
  const akash = current.observations.filter(o => o.source === "akash" && o.kind === "gpu_capacity" && o.details.online === true);
  const openrouter = current.observations.filter(o => o.source === "openrouter");
  return {
    version: 1, kind: "compute_scout_observation_report", observedAt: current.observedAt, digest: current.digest,
    previousDigest: previous?.digest ?? null,
    sourceResults: bySource,
    publicSourcesHealthy: ["akash", "openrouter"].every(s => bySource.some(r => r.source === s && r.status === "ok" && r.records > 0)),
    metrics: {
      akashOnlineProvidersObserved: akash.length,
      akashOnlineProvidersReportingFreeGpus: akash.filter(o => o.availableGpus !== null && o.availableGpus > 0).length,
      akashReportedAvailableGpusOnline: akash.reduce((sum, o) => sum + (o.availableGpus ?? 0), 0),
      openrouterModelsObserved: openrouter.length,
      openrouterModelsWithInputPrice: openrouter.filter(o => o.priceUsdPerMillionInputTokens !== null).length,
    },
    caveats: [
      "Supplier observations are incomplete, non-calibrated and not a census of global deliverable compute.",
      "New/not observed listing changes are NOT proved additions/removals of capacity.",
      "A failed source is not compared, and credential gaps are not supply shortages.",
      "No provider work, purchase or REHT execution authorization is performed.",
    ],
  };
}

export function markdown(report) {
  const rows = report.sourceResults.map(s => `| ${s.source} | ${s.status} | ${s.records} | ${s.newListings ?? "—"} | ${s.changedMeasures ?? "—"} | ${s.notObservedAgain ?? "—"} |`).join("\n");
  return `## Compute Scout — ${report.observedAt}\n\n` +
    `**Public API health:** ${report.publicSourcesHealthy ? "OK" : "INCOMPLETE"}; **digest:** \`${report.digest}\`\n\n` +
    `| Source | Status | Observations | New listings | Changed measures | Not observed again |\n|---|---|---:|---:|---:|---:|\n${rows}\n\n` +
    `Akash online providers: **${report.metrics.akashOnlineProvidersObserved}**; providers reporting available GPUs: **${report.metrics.akashOnlineProvidersReportingFreeGpus}**; supplier-reported available GPUs at online providers: **${report.metrics.akashReportedAvailableGpusOnline}**.\n\n` +
    `OpenRouter model entries: **${report.metrics.openrouterModelsObserved}**; with input pricing: **${report.metrics.openrouterModelsWithInputPrice}**.\n\n` +
    `These are observations, not verified global capacity, workload benchmarks or calibrated Solland elasticities. Missing listings are not proven removals.\n`;
}

async function main() {
  if (flags.has("--check-public")) {
    const report = JSON.parse(await readFile(flags.get("--check-public"), "utf8"));
    if (report.publicSourcesHealthy !== true) throw new Error("Required public API observations are missing; check source status in artifact");
    return;
  }
  for (const required of ["--current", "--out", "--markdown"]) if (!flags.get(required)) throw new Error(`Missing ${required}`);
  const current = JSON.parse(await readFile(flags.get("--current"), "utf8"));
  let previous = null;
  if (flags.get("--previous")) {
    try { previous = JSON.parse(await readFile(flags.get("--previous"), "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const report = summarize(current, previous);
  await writeFile(flags.get("--out"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  await writeFile(flags.get("--markdown"), markdown(report), { flag: "wx" });
}

if (process.argv[1]?.endsWith("compute-scout-report.mjs")) {
  main().catch(error => { console.error(`compute-scout-report: ${error.message}`); process.exitCode = 1; });
}
