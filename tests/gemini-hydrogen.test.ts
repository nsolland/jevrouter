import { test } from "node:test";
import assert from "node:assert/strict";
import { GEMINI_HYDROGEN, hydrogenTaskBenchmark } from "../src/gemini-hydrogen.js";
import { recommendModelsForTask } from "../src/compute-task-fit.js";

test("Hydrogen remains an execution candidate, not a decision provider", () => {
  assert.equal(GEMINI_HYDROGEN.role, "execution_model");
  assert.equal(GEMINI_HYDROGEN.benchmarkStatus, "unverified");
});
test("missing independent measurements abstain", () => {
  assert.equal(recommendModelsForTask({ taskClass: "coding", minimumQuality: 0.8 }, []).status, "abstain");
});
test("only labelled measurements can qualify Hydrogen", () => {
  assert.throws(() => hydrogenTaskBenchmark({ taskClass: "coding", region: "eu", acceptedRate: 1, costUsdPerAttempt: 0.01, p95LatencyMs: 100, sampleSize: 30, evidenceId: "" }));
  const measured = hydrogenTaskBenchmark({ taskClass: "coding", region: "eu", acceptedRate: 0.9, costUsdPerAttempt: 0.02, p95LatencyMs: 900, sampleSize: 30, evidenceId: "independent-holdout-1" });
  const result = recommendModelsForTask({ taskClass: "coding", minimumQuality: 0.8 }, [measured]);
  assert.equal(result.status, "candidate");
  assert.equal(result.candidates[0]?.modelId, "gemini-4-hydrogen");
  assert.equal(result.authority, "analysis_only");
});
