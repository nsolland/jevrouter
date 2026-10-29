import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateChoiceHoldout, validateChoiceHoldout, type LabeledChoiceCase } from "../src/typed-decision-eval.js";
import type { JevProvider, JevRouteRequest, JevRawResponse } from "../src/types.js";

const cases: LabeledChoiceCase[] = [
  { id: "1", state: "case 1", instructions: "Pick a class", criteria: { yes: "allowed", no: "not allowed" }, expected: "yes", task_class: "routing", language: "en" },
  { id: "2", state: "case 2", instructions: "Pick a class", criteria: { yes: "allowed", no: "not allowed" }, expected: "no", task_class: "policy", language: "no" },
  { id: "3", state: "case 3", instructions: "Pick a class", criteria: { yes: "allowed", no: "not allowed" }, expected: "no", task_class: "policy", language: "no" },
];

class FakeProvider implements JevProvider {
  readonly name = "test-provider";
  async decide(input: JevRouteRequest): Promise<JevRawResponse> {
    if (input.state === "case 3") throw new Error("sensitive input should not be serialized");
    return {
      answers: { label: { type: "choice", choice: "yes", probabilities: { yes: 0.95, no: 0.05 }, confidence: 0.95 } },
      usage: { input_tokens: 10, output_tokens: 0 },
    };
  }
}

test("live holdout gate requires 200 unique labelled cases before any external call", () => {
  assert.throws(() => validateChoiceHoldout(cases), /at least 200/);
  assert.throws(() => validateChoiceHoldout([cases[0], cases[0]], 1), /unique/);
  assert.throws(() => validateChoiceHoldout([{ ...cases[0], expected: "maybe" }], 1), /including expected/);
  assert.doesNotThrow(() => validateChoiceHoldout(Array.from({ length: 200 }, (_, i) => ({ ...cases[0], id: String(i) }))));
});

test("evaluation keeps provider failures and confident mistakes in the denominator", async () => {
  const result = await evaluateChoiceHoldout(cases, new FakeProvider(), [0.9, 0.99]);
  assert.equal(result.sample_count, 3);
  assert.equal(result.answered, 2);
  assert.equal(result.correct, 1);
  assert.equal(result.accuracy_including_failures, 1 / 3);
  assert.ok(Math.abs(result.expected_calibration_error! - 0.45) < 1e-10);
  assert.deepEqual(result.selective.map(s => ({ count: s.count, coverage: s.coverage, error_rate: s.error_rate })), [
    { count: 2, coverage: 2 / 3, error_rate: 0.5 },
    { count: 0, coverage: 0, error_rate: null },
  ]);
  assert.deepEqual(result.by_task_class, { policy: { count: 2, correct: 0 }, routing: { count: 1, correct: 1 } });
  assert.equal(result.observations[2].error, "Error");
  assert.equal(result.observations[2].predicted, null);
  assert.equal(result.total_input_tokens, null);
  assert.match(result.dataset_sha256, /^sha256:/);
  assert.equal(JSON.stringify(result).includes("sensitive input"), false);
});
