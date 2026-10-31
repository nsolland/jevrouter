import { strict as assert } from "node:assert";
import { test } from "node:test";
import { routePairwise } from "./routellm-pairwise.js";

const valid = {
  strongModel: "strong",
  weakModel: "weak",
  strongWinRate: 0.8,
  threshold: 0.5,
  calibrationId: "frozen-cohort-v1",
  allowedModels: ["strong", "weak"],
};
test("selects strong above threshold without executing", () => {
  const result = routePairwise(valid);
  assert.equal(result.choice, "strong");
  assert.equal(result.requiresAuthorization, true);
});
test("selects weak at threshold", () => {
  assert.equal(routePairwise({ ...valid, strongWinRate: 0.5 }).choice, "weak");
});
test("abstains without calibration", () => {
  assert.equal(routePairwise({ ...valid, calibrationId: null }).choice, "abstain");
});
test("abstains on invalid score", () => {
  assert.equal(routePairwise({ ...valid, strongWinRate: Number.NaN }).choice, "abstain");
});
test("abstains on forbidden model", () => {
  assert.equal(routePairwise({ ...valid, allowedModels: ["strong"] }).choice, "abstain");
});
test("abstains on invalid threshold", () => {
  assert.equal(routePairwise({ ...valid, threshold: 2 }).choice, "abstain");
});
