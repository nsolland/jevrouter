import assert from "node:assert/strict";
import { test } from "node:test";
import { createGoalContract, initialGoalRoute, decideGoalEscalation } from "../src/goal-contract.js";

const goal = () => createGoalContract({
  goal: "Fix regression, test, and deliver",
  essentials: ["repo=jevrouter", "base=main"],
  constraints: ["Do not expand scope"],
  successCriteria: ["Tests pass", "PR exists"],
  budget: { maxModelCalls: 8 },
});
test("goal contracts are stable and require measurable success", () => {
  const a = goal(), b = goal();
  assert.equal(a.id, b.id);
  assert.equal(a.executionAuthorized, false);
  assert.deepEqual(a.successCriteria, ["Tests pass", "PR exists"]);
  assert.throws(() => createGoalContract({ goal: "hi", successCriteria: [] }), /GOAL_MISSING_SUCCESS_CRITERIA/);
});
test("KISS cannot override mission budget", () => {
  const c = goal();
  assert.equal(initialGoalRoute(c, { maxModelCalls: 0, directAvailable: true, statelessSingleAnswer: true }).mode, "abstain");
  assert.equal(initialGoalRoute(c, { requiresAction: true, directAvailable: true, statelessSingleAnswer: true }).mode, "agent");
});
test("verified success stops instead of calling more models", () => {
  const c = goal();
  const result = decideGoalEscalation(c, { contractId: c.id, previousMode: "direct", outcome: "completed", successVerified: true, capacityInsufficient: false, approvedModes: [], remainingModelCalls: 4 });
  assert.equal(result.status, "complete");
  assert.equal(result.executionAuthorized, false);
});
test("unverified completion never counts as done", () => {
  const c = goal();
  const result = decideGoalEscalation(c, { contractId: c.id, previousMode: "direct", outcome: "completed", successVerified: false, capacityInsufficient: false, approvedModes: ["bounded"], remainingModelCalls: 3 });
  assert.equal(result.status, "continue");
});
test("only next approved level and verified gap can escalate", () => {
  const c = goal();
  const base = { contractId: c.id, previousMode: "direct" as const, outcome: "incomplete" as const, successVerified: false, capacityInsufficient: true, remainingModelCalls: 4 };
  assert.deepEqual(decideGoalEscalation(c, { ...base, approvedModes: ["bounded"] }).mode, "bounded");
  assert.equal(decideGoalEscalation(c, { ...base, approvedModes: ["deep"] }).status, "blocked");
  assert.equal(decideGoalEscalation(c, { ...base, approvedModes: ["bounded"], remainingModelCalls: 0 }).status, "blocked");
  assert.throws(() => decideGoalEscalation(c, { ...base, contractId: "another", approvedModes: ["bounded"] }), /GOAL_CONTRACT_MISMATCH/);
});
