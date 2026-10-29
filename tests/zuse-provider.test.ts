import { test } from "node:test";
import assert from "node:assert/strict";
import { createProvider } from "../src/runtime.js";
import { getChoiceAnswer } from "../src/provider.js";
import type { CapabilityManifest } from "../src/types.js";

const candidates: CapabilityManifest[] = [
  { id: "read", name: "Read", type: "mcp_tool", description: "Read a document" },
  { id: "write", name: "Write", type: "mcp_tool", description: "Modify a document" },
];

test("Zuse sends Choice requests to its own endpoint with its own credential", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let seenUrl = "";
  let seenInit: RequestInit | undefined;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seenUrl = String(input);
    seenInit = init;
    return new Response(JSON.stringify({
      model: "zuse-27b",
      answers: { tool: { type: "choice", choice: "read", probabilities: { read: 0.98, write: 0.02 }, confidence: 0.98 } },
      usage: { input_tokens: 100, output_tokens: 0 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const provider = createProvider("zuse", { apiKey: "test-bineric-key" });
  const raw = await provider.decide({ state: { request: "read this document" }, candidates });
  assert.equal(provider.name, "bineric-zuse");
  assert.equal(seenUrl, "https://api.bineric.com/v1/zuse");
  assert.equal(new Headers(seenInit?.headers).get("authorization"), "Bearer test-bineric-key");
  assert.deepEqual(JSON.parse(String(seenInit?.body)), {
    state: { request: "read this document" },
    model: "zuse-27b",
    questions: {
      tool: {
        type: "choice",
        instructions: "Which single capability should handle this request? Choose only from the supplied options.",
        criteria: {
          read: "Read: Read a document [type=mcp_tool]",
          write: "Write: Modify a document [type=mcp_tool]",
        },
      },
    },
  });
  assert.equal(getChoiceAnswer(raw).choice, "read");
  assert.equal(raw.usage?.output_tokens, 0);
});

test("Zuse 9B can be selected explicitly without changing the provider boundary", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let seenModel: string | undefined;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    seenModel = (JSON.parse(String(init?.body)) as { model: string }).model;
    return new Response(JSON.stringify({ answers: { tool: { type: "choice", choice: "read", probabilities: { read: 1 } } } }), { status: 200 });
  }) as typeof fetch;
  await createProvider("zuse", { apiKey: "test-bineric-key", model: "zuse-9b" }).decide({ state: "read", candidates });
  assert.equal(seenModel, "zuse-9b");
});

test("Zuse never borrows TypeSafe or OpenRouter credentials", () => {
  const original = {
    bineric: process.env.BINERIC_API_KEY,
    typesafe: process.env.TYPESAFE_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
  };
  try {
    delete process.env.BINERIC_API_KEY;
    process.env.TYPESAFE_API_KEY = "other-provider-key";
    process.env.OPENROUTER_API_KEY = "other-provider-key";
    assert.throws(() => createProvider("zuse"), /Missing BINERIC_API_KEY/);
  } finally {
    for (const [name, value] of [
      ["BINERIC_API_KEY", original.bineric],
      ["TYPESAFE_API_KEY", original.typesafe],
      ["OPENROUTER_API_KEY", original.openrouter],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("Zuse authentication and malformed answers fail closed", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const provider = createProvider("zuse", { apiKey: "test-bineric-key" });
  globalThis.fetch = (async () => new Response("Unauthorized", { status: 401 })) as typeof fetch;
  await assert.rejects(provider.decide({ state: "read", candidates }), /rejected the API key/);

  globalThis.fetch = (async () => new Response(JSON.stringify({ model: "zuse-27b", answers: {} }), { status: 200 })) as typeof fetch;
  const raw = await provider.decide({ state: "read", candidates });
  assert.throws(() => getChoiceAnswer(raw), /missing answers.tool/);
});
