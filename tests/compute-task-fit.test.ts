import test from "node:test";
import assert from "node:assert/strict";
import { recommendModelsForTask, type ModelTaskBenchmark } from "../src/compute-task-fit.js";

const fixtures: ModelTaskBenchmark[] = [
  { modelId: "large-api", taskClass: "extraction", region: "us", deploymentMode: "api", acceptedRate: .98, costUsdPerAttempt: .2, p95LatencyMs: 100, sampleSize: 100, evidenceId: "holdout-1" },
  { modelId: "small-local", taskClass: "extraction", region: "no", deploymentMode: "local", acceptedRate: .95, costUsdPerAttempt: .01, p95LatencyMs: 80, sampleSize: 100, evidenceId: "holdout-2" },
];

test("task fit ranks verified cost per accepted task rather than model size or token price", () => {
  const result = recommendModelsForTask({ taskClass: "extraction", minimumQuality: .9 }, fixtures);
  assert.equal(result.status, "candidate");
  assert.equal(result.authority, "analysis_only");
  assert.deepEqual(result.candidates.map(c => c.modelId), ["small-local", "large-api"]);
});

test("region, deployment and quality requirements filter model options", () => {
  const result = recommendModelsForTask({ taskClass: "extraction", minimumQuality: .97, allowedRegions: ["no"], allowedDeploymentModes: ["local"] }, fixtures);
  assert.equal(result.status, "abstain");
  assert.equal(result.reason, "no_qualified_benchmark");
});

test("unmeasured, sparse or invalid evidence cannot become a recommendation", () => {
  for (const changes of [{ sampleSize: 2 }, { acceptedRate: NaN }, { costUsdPerAttempt: -1 }, { evidenceId: "" }]) {
    assert.equal(recommendModelsForTask({ taskClass: "extraction", minimumQuality: .9 }, [{ ...fixtures[0]!, ...changes }]).status, "abstain");
  }
});

test("other task classes do not inherit benchmark claims", () => {
  assert.equal(recommendModelsForTask({ taskClass: "reasoning", minimumQuality: .9 }, fixtures).status, "abstain");
});
