import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTaskFitVsFixedModel } from "../src/compute-task-fit-eval.js";
import type { ModelTaskBenchmark } from "../src/compute-task-fit.js";

const benchmarks: ModelTaskBenchmark[] = [
  { modelId: "big", taskClass: "extract", region: "eu", deploymentMode: "api", acceptedRate: .99, costUsdPerAttempt: 1, p95LatencyMs: 100, sampleSize: 100, evidenceId: "holdout-a" },
  { modelId: "small", taskClass: "extract", region: "no", deploymentMode: "local", acceptedRate: .95, costUsdPerAttempt: .1, p95LatencyMs: 90, sampleSize: 100, evidenceId: "holdout-b" },
];

test("paired replay calculates cost and joules per accepted completion, not token count", () => {
  const result = evaluateTaskFitVsFixedModel([
    { id: "a", task: { taskClass: "extract", minimumQuality: .9 }, outcomes: [
      { modelId: "big", accepted: true, costUsd: 1, energyJoules: 100 },
      { modelId: "small", accepted: true, costUsd: .1, energyJoules: 20 },
    ] },
    { id: "b", task: { taskClass: "extract", minimumQuality: .9 }, outcomes: [
      { modelId: "big", accepted: true, costUsd: 1, energyJoules: 100 },
      { modelId: "small", accepted: false, costUsd: .1, energyJoules: 20 },
    ] },
  ], benchmarks, "big");
  assert.equal(result.fixed.costPerAcceptedUsd, 1);
  assert.equal(result.taskFit.costPerAcceptedUsd, .2);
  assert.equal(result.fixed.joulesPerAccepted, 100);
  assert.equal(result.taskFit.joulesPerAccepted, 40);
  assert.equal(result.executionAuthority, false);
});

test("missing paired evidence rejects rather than manufactures savings", () => {
  assert.throws(() => evaluateTaskFitVsFixedModel([{ id: "a", task: { taskClass: "extract", minimumQuality: .9 }, outcomes: [
    { modelId: "big", accepted: true, costUsd: 1, energyJoules: 100 },
  ] }], benchmarks, "big"), /missing or duplicate paired outcome/);
});
