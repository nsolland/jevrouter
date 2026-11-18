import test from "node:test";
import assert from "node:assert/strict";
import { routePairwise } from "../src/routing/routellm-pairwise.ts";
const baseline = {
  strongModel: "strong", weakModel: "weak", strongWinRate: 0.8,
  threshold: 0.5, calibrationId: "locked-pair-v1", allowedModels: ["strong", "weak"],
};
test("calibrated strong route remains decision-only", () => {
  const value = routePairwise(baseline);
  assert.equal(value.choice, "strong");
  assert.equal(value.requiresAuthorization, true);
});
test("weak route at threshold", () =>
  assert.equal(routePairwise({ ...baseline, strongWinRate: 0.5 }).choice, "weak"));
test("missing calibration abstains", () =>
  assert.equal(routePairwise({ ...baseline, calibrationId: null }).choice, "abstain"));
test("invalid score abstains", () =>
  assert.equal(routePairwise({ ...baseline, strongWinRate: Number.NaN }).choice, "abstain"));
test("not allowed pair abstains", () =>
  assert.equal(routePairwise({ ...baseline, allowedModels: ["strong"] }).choice, "abstain"));
