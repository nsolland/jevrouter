import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { markdown, summarize, verifySnapshot } from "../scripts/compute-scout-report.mjs";

function snapshot(observations, sources, observedAt = "2026-11-01T12:00:00.000Z") {
  const digest = createHash("sha256").update(JSON.stringify({ now: observedAt, results: sources, observations })).digest("hex");
  return { version: 1, kind: "market_observations_not_calibrated_capacity", mode: "read_only", observedAt,
    sources, observations, digest };
}

function gpu(reference, availableGpus, online = true) {
  return { source: "akash", kind: "gpu_capacity", reference, availableGpus, availability: availableGpus > 0,
    priceUsdPerGpuHour: null, priceUsdPerMillionInputTokens: null, priceUsdPerMillionOutputTokens: null,
    details: { online } };
}

const sources = [
  { source: "akash", status: "ok", records: 2 },
  { source: "openrouter", status: "ok", records: 1 },
  { source: "salad", status: "credentials_required", records: 0 },
];
const model = { source: "openrouter", kind: "model_catalog", reference: "model-a", availableGpus: null,
  availability: null, priceUsdPerGpuHour: null, priceUsdPerMillionInputTokens: 1.2,
  priceUsdPerMillionOutputTokens: 3, details: {} };

test("summarizes healthy public endpoints without claiming global availability", () => {
  const report = summarize(snapshot([gpu("provider-1", 4), gpu("provider-2", 0, false), model], sources));
  assert.equal(report.publicSourcesHealthy, true);
  assert.equal(report.metrics.akashOnlineProvidersObserved, 1);
  assert.equal(report.metrics.akashReportedAvailableGpusOnline, 4);
  assert.equal(report.metrics.openrouterModelsWithInputPrice, 1);
  assert.equal(report.sourceResults[2].comparison, "first_observation");
  assert.match(markdown(report), /not verified global capacity/);
});

test("detects listing and measure changes without treating missing offers as removals", () => {
  const old = snapshot([gpu("provider-1", 4), gpu("provider-2", 1), model], sources);
  const current = snapshot([gpu("provider-1", 2), gpu("provider-3", 8), model], sources, "2026-11-01T18:00:00.000Z");
  const report = summarize(current, old);
  assert.deepEqual(report.sourceResults[0], {
    source: "akash", status: "ok", records: 2, comparison: "comparable_listing_changes",
    newListings: 1, notObservedAgain: 1, changedMeasures: 1,
  });
});

test("failed source is excluded from change comparison and not counted as lost capacity", () => {
  const old = snapshot([gpu("provider-1", 4), model], sources.map(s => ({ ...s, records: s.source === "akash" ? 1 : s.records })));
  const nextStatus = sources.map(s => s.source === "akash" ? { ...s, status: "rate_limited", records: 0 } : s);
  const current = snapshot([model], nextStatus, "2026-11-01T18:00:00.000Z");
  const report = summarize(current, old);
  assert.equal(report.publicSourcesHealthy, false);
  assert.equal(report.sourceResults[0].comparison, "unavailable");
  assert.equal(report.sourceResults[0].notObservedAgain, null);
});

test("rejects corrupt observation snapshots", () => {
  const valid = snapshot([gpu("provider-1", 4), model], sources);
  assert.doesNotThrow(() => verifySnapshot(valid));
  valid.observations[0].availableGpus = 99;
  assert.throws(() => verifySnapshot(valid), /digest/);
});
