import { test } from "node:test";
import assert from "node:assert/strict";
import { JustWorkAdapter } from "../src/justwork.js";
import { digest } from "../src/guarded-reuse.js";
import { sha256 } from "../src/utils.js";
import { defaultPolicy } from "../src/manifest.js";
import type { JevProvider } from "../src/types.js";

test("adapter checks live actor, permissions, candidate set and policy before advisory analysis reuse", () => {
  const provider = { name: "never-called", decide: async () => { throw Error("unexpected routing"); } } as JevProvider;
  const adapter = new JustWorkAdapter(provider, [], defaultPolicy);
  const input = { request: "analyze", task_class: "analysis", actor: "alice", actor_permissions: ["read"], input: { x: 1 } };
  const previous = {
    goal: input.request, taskClass: input.task_class,
    actorDigest: digest("alice"), permissionDigest: sha256(["read"]),
    candidateDigest: sha256([]), policyDigest: sha256(defaultPolicy),
    inputDigest: sha256({ input: { x: 1 }, context: null }),
    output: "safe summary", outputDigest: digest("safe summary"), authorityRequired: false,
  };
  assert.equal(adapter.evaluateAnalysisReuse(previous, input).status, "REUSE");
  assert.equal(adapter.evaluateAnalysisReuse(previous, { ...input, actor: "bob" }).status, "RECOMPUTE");
  assert.equal(adapter.evaluateAnalysisReuse(previous, { ...input, actor_permissions: ["write"] }).status, "RECOMPUTE");
  assert.equal(adapter.evaluateAnalysisReuse(previous, { ...input, context: { updated: true } }).status, "RECOMPUTE");
  assert.equal(adapter.evaluateAnalysisReuse({ ...previous, authorityRequired: true }, input).status, "RECOMPUTE");
});
