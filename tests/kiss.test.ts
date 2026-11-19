import assert from "node:assert/strict";
import { test } from "node:test";
import { selectKissExecution } from "../src/kiss.js";

test("explicit deterministic answer takes no model call and authorizes nothing", () => {
  const result = selectKissExecution({ request: "return cached value", deterministicAnswer: "OK", maxCostMinor: 0 });
  assert.equal(result.mode, "deterministic");
  assert.equal(result.deterministicAnswer, "OK");
  assert.equal(result.maxModelCalls, 0);
  assert.equal(result.executionAuthorized, false);
});

test("one call only when caller explicitly certifies a stateless answer and direct provider", () => {
  assert.equal(selectKissExecution({ request: "Reply exactly OK", statelessSingleAnswer: true, directAvailable: true }).mode, "direct");
  assert.equal(selectKissExecution({ request: "Reply exactly OK", directAvailable: true }).mode, "agent");
  assert.equal(selectKissExecution({ request: "Reply exactly OK", statelessSingleAnswer: true }).mode, "agent");
});

test("short prompts cannot bypass effects or context", () => {
  const base = { request: "OK", deterministicAnswer: "OK", statelessSingleAnswer: true, directAvailable: true };
  for (const risk of ["requiresAction", "requiresTools", "requiresContext", "requiresPlanning"] as const) {
    const result = selectKissExecution({ ...base, [risk]: true });
    assert.notEqual(result.mode, "direct");
    assert.notEqual(result.mode, "deterministic");
  }
});

test("bounded requires an explicit narrow toolset and cannot cover effects", () => {
  const base = { request: "Read one status", requiresTools: true };
  assert.equal(selectKissExecution({ ...base, boundedToolsets: ["read-status"] }).mode, "bounded");
  assert.equal(selectKissExecution({ ...base, boundedToolsets: ["all"] }).mode, "agent");
  assert.equal(selectKissExecution({ ...base, boundedToolsets: ["read-status"], requiresAction: true }).mode, "agent");
  assert.equal(selectKissExecution({ ...base, boundedToolsets: ["read-status"], maxModelCalls: 1 }).mode, "agent");
});

test("budget exhaustion abstains, not silently escalating to paid agent", () => {
  assert.equal(selectKissExecution({ request: "Analyze", maxCostMinor: 0 }).mode, "abstain");
  assert.equal(selectKissExecution({ request: "Analyze", maxModelCalls: 0 }).mode, "abstain");
  assert.throws(() => selectKissExecution({ request: "Analyze", maxCostMinor: -1 }), /KISS_INVALID_BUDGET/);
  assert.throws(() => selectKissExecution({ request: "" }), /KISS_INVALID_REQUEST/);
});
