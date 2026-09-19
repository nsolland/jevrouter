import { test } from "node:test";
import assert from "node:assert/strict";
import type { CapabilityManifest, JevProvider, JevRawResponse } from "../src/types.js";
import { JevRouter } from "../src/router.js";

const capabilities: CapabilityManifest[] = [
  {
    id: "search.web",
    name: "Web search",
    type: "mcp_tool",
    description: "Search the public web",
    permissions: [],
    risk: { level: "low" },
  },
  {
    id: "deploy.prod",
    name: "Production deploy",
    type: "cli",
    description: "Deploy the current release to production",
    permissions: ["deploy"],
    risk: { level: "high" },
    policy: { requires_confirmation: true },
  },
];

class CountingProvider implements JevProvider {
  readonly name = "test";
  calls = 0;
  constructor(private readonly raw: JevRawResponse) {}
  async decide(): Promise<JevRawResponse> {
    this.calls += 1;
    return this.raw;
  }
}

async function loadAdapter(): Promise<any> {
  const modulePath: string = "../src/justwork.js";
  return import(modulePath);
}

test("JevRouter can policy-check an explicit capability without calling Jev", async () => {
  const provider = new CountingProvider({
    answers: { tool: { type: "choice", choice: "search.web", probabilities: { "search.web": 1, "deploy.prod": 0 }, confidence: 1 } },
  });
  const router = new JevRouter(provider, { allowed_risk_levels: ["low", "high"] });
  const routeSelected = (router as unknown as {
    routeSelected(input: { request: string; actor_permissions?: string[] }, candidates: CapabilityManifest[], capabilityId: string): Promise<any>;
  }).routeSelected.bind(router);

  const result = await routeSelected({ request: "search now" }, capabilities, "search.web");

  assert.equal(provider.calls, 0);
  assert.equal(result.status, "selected");
  assert.equal(result.decision.selected, "search.web");
  assert.equal(result.decision.jev_choice, null);
  assert.equal(result.raw_jev, null);
});

test("JustWork uses an explicit deterministic capability before Jev and marks consequential work for the authority gate", async () => {
  const { JustWorkAdapter } = await loadAdapter();
  const provider = new CountingProvider({
    answers: { tool: { type: "choice", choice: "deploy.prod", probabilities: { "search.web": 0.1, "deploy.prod": 0.9 }, confidence: 0.9 } },
  });
  const router = new JevRouter(provider, { allowed_risk_levels: ["low", "high"] });
  const adapter = new JustWorkAdapter(router, capabilities);

  const result = await adapter.route({ request: "search now", capability_id: "search.web", consequential: true });

  assert.equal(provider.calls, 0);
  assert.equal(result.source, "deterministic");
  assert.deepEqual(result.dispatch, {
    kind: "capability",
    capability_id: "search.web",
    requires_authority_gate: true,
    reason: null,
  });
});

test("JustWork sends an ordinary high-confidence Jev selection directly to the capability", async () => {
  const { JustWorkAdapter } = await loadAdapter();
  const provider = new CountingProvider({
    answers: { tool: { type: "choice", choice: "search.web", probabilities: { "search.web": 0.9, "deploy.prod": 0.1 }, confidence: 0.9 } },
  });
  const router = new JevRouter(provider, { min_confidence: 0.55, allowed_risk_levels: ["low", "high"] });
  const adapter = new JustWorkAdapter(router, capabilities);

  const result = await adapter.route({ request: "find the current release notes" });

  assert.equal(provider.calls, 1);
  assert.equal(result.source, "jev");
  assert.equal(result.dispatch.kind, "capability");
  assert.equal(result.dispatch.capability_id, "search.web");
  assert.equal(result.dispatch.requires_authority_gate, false);
});

test("JustWork sends Jev no_decision to the reasoning fallback", async () => {
  const { JustWorkAdapter } = await loadAdapter();
  const provider = new CountingProvider({
    answers: { tool: { type: "choice", choice: "search.web", probabilities: { "search.web": 0.51, "deploy.prod": 0.49 }, confidence: 0.2 } },
  });
  const router = new JevRouter(provider, { min_confidence: 0.55, allowed_risk_levels: ["low", "high"] });
  const adapter = new JustWorkAdapter(router, capabilities);

  const result = await adapter.route({ request: "do the thing" });

  assert.equal(result.route.status, "no_decision");
  assert.equal(result.dispatch.kind, "reasoning_fallback");
  assert.equal(result.dispatch.capability_id, null);
});

test("JustWork keeps confirmation-required choices as human exceptions", async () => {
  const { JustWorkAdapter } = await loadAdapter();
  const provider = new CountingProvider({
    answers: { tool: { type: "choice", choice: "deploy.prod", probabilities: { "search.web": 0.1, "deploy.prod": 0.9 }, confidence: 0.9 } },
  });
  const router = new JevRouter(provider, { min_confidence: 0.55, allowed_risk_levels: ["low", "high"] });
  const adapter = new JustWorkAdapter(router, capabilities);

  const result = await adapter.route({ request: "deploy this", actor_permissions: ["deploy"], consequential: true });

  assert.equal(result.route.status, "needs_confirmation");
  assert.equal(result.dispatch.kind, "human_review");
  assert.equal(result.dispatch.capability_id, "deploy.prod");
  assert.equal(result.dispatch.requires_authority_gate, true);
});
