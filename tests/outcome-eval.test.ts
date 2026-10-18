import { test } from "node:test";
import assert from "node:assert/strict";
import { requirePairedTasks, summarizeOutcomes, type TaskOutcome } from "../src/outcome-eval.js";

const row = (arm: string, task_id: string, success: boolean, cost: number): TaskOutcome => ({
  arm, task_id, verified_success: success, verifier_id: "external:test-v1",
  total_cost_usd: cost, elapsed_ms: 200, model_calls: 2, cache_hits: 1,
  model_switches: 0, retries: 0, unauthorized_effects: 0,
});
test("cost per verified success includes failed runs", () => {
  const results = summarizeOutcomes([row("jev", "a", true, 1), row("jev", "b", false, 2)]);
  assert.equal(results[0].cost_per_verified_success_usd, 3);
  assert.equal(results[0].success_rate, 0.5);
});
test("zero verified completions is not a free success", () => {
  assert.equal(summarizeOutcomes([row("rules", "a", false, 2)])[0].cost_per_verified_success_usd, null);
});
test("rejects duplicate run identification and missing verifier", () => {
  assert.throws(() => summarizeOutcomes([row("jev", "a", true, 1), row("jev", "a", false, 2)]), /duplicate/);
  assert.throws(() => summarizeOutcomes([{...row("jev", "a", true, 1), verifier_id:""}]), /verifier/);
});
test("requires equivalent tasks across arms", () => {
  assert.doesNotThrow(() => requirePairedTasks([row("jev", "a", true, 1), row("rules", "a", true, 1)]));
  assert.throws(() => requirePairedTasks([row("jev", "a", true, 1), row("rules", "b", true, 1)]), /unpaired/);
});
