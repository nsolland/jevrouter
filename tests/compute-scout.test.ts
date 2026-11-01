import { test } from "node:test";
import assert from "node:assert/strict";
import { collectComputeMarket, COMPUTE_SCOUT_SOURCES } from "../src/compute-scout.js";

const now = () => new Date("2026-11-01T12:00:00.000Z");
const stub = (handler: (url: string, init: RequestInit) => unknown): typeof fetch =>
  (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const result = handler(String(input), init);
    return result instanceof Response ? result : Response.json(result);
  }) as typeof fetch;

test("Akash reports provider-level GPU totals without misattributing mixed models or identities", async () => {
  const report = await collectComputeMarket({ sources: ["akash"] }, { now, fetch: stub(url => {
    assert.equal(url, "https://console-api.akash.network/v1/providers");
    return [
      { owner: "akash1", email: "sensitive@example.com", ipCountryCode: "NO", ipRegionCode: "rogaland", isOnline: true,
        gpuModels: [{ model: "rtx4090" }], stats: { gpu: { total: 4, active: 1, available: 2, pending: 1 } } },
      { owner: "akash2", isOnline: true, gpuModels: [{ model: "a100" }, { model: "h100" }],
        stats: { gpu: { total: 2, active: 0, available: 2, pending: 0 } } },
    ];
  }) });
  assert.equal(report.kind, "market_observations_not_calibrated_capacity");
  assert.equal(report.mode, "read_only");
  assert.equal(report.sources[0]!.status, "ok");
  assert.equal(report.observations.length, 2);
  assert.equal(report.observations[0]!.availableGpus, 2);
  assert.equal(report.observations[0]!.gpuType, "rtx4090");
  assert.equal(report.observations[0]!.country, "NO");
  assert.equal(report.observations[1]!.gpuType, null);
  assert.equal(report.observations[1]!.capacityBasis, "provider_total");
  assert.ok(!JSON.stringify(report).includes("sensitive@example.com"));
});

test("OpenRouter model-token prices are never converted to GPU-hours or capacity", async () => {
  const report = await collectComputeMarket({ sources: ["openrouter"] }, { now, fetch: stub(() => ({
    data: [{ id: "demo/model", name: "Demo", context_length: 128000, pricing: { prompt: "0.0000003", completion: "0.000001" } }],
  })) });
  const item = report.observations[0]!;
  assert.equal(item.reference, "demo/model");
  assert.equal(item.kind, "model_catalog");
  assert.ok(Math.abs(item.priceUsdPerMillionInputTokens! - 0.3) < 1e-8);
  assert.equal(item.priceUsdPerMillionOutputTokens, 1);
  assert.equal(item.priceUsdPerGpuHour, null);
  assert.equal(item.availableGpus, null);
  assert.equal(item.availability, null);
});

test("missing supplier credentials are explicit and never cause network requests", async () => {
  const report = await collectComputeMarket({ sources: ["salad", "vast", "runpod", "lambda", "shadeform"] }, {
    now, fetch: stub(() => { throw Error("should not call network"); }),
  });
  assert.deepEqual(report.sources.map(s => s.status), Array(5).fill("credentials_required"));
  assert.equal(report.observations.length, 0);
});

test("Salad class catalog and scoped availability request preserve overlapping tiers", async () => {
  const token = "supersecret";
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const report = await collectComputeMarket({ sources: ["salad"], credentials: { salad: token },
    saladOrganization: "example-org", saladGpuClassIds: ["class1"], saladCountryCodes: ["no"],
  }, { now, fetch: stub((url, init) => {
    requests.push({ url, init });
    if (url.endsWith("/gpu-classes")) return { items: [{ id: "class1", name: "RTX 4090" }] };
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(String(init.body)), {
      gpu_classes: ["class1"], country_codes: ["no"], cpu: 4, memory: 8192, storage_amount: 1_000_000_000,
    });
    assert.equal((init.headers as Record<string, string>)["Salad-Api-Key"], token);
    return { available_gpu_high: 10, available_gpu_medium: 5, available_gpu_low: 2, available_gpu_batch: 1 };
  }) });
  assert.equal(report.sources[0]!.status, "ok");
  assert.equal(requests.length, 2);
  assert.equal(report.observations.length, 5);
  const tiers = report.observations.filter(o => o.capacityBasis === "query_tier");
  assert.deepEqual(tiers.map(o => o.availableGpus), [10, 5, 2, 1]);
  assert.equal(tiers[0]!.country, "no");
  assert.equal(tiers[0]!.details.overlappingTiers, true);
  assert.ok(!JSON.stringify(report).includes(token));
});

test("Salad without requested class IDs exposes catalog but does not invent availability", async () => {
  const report = await collectComputeMarket({ sources: ["salad"], credentials: { salad: "secret" },
    saladOrganization: "example-org",
  }, { now, fetch: stub(() => ({ items: [{ id: "class1", name: "RTX 4090" }] })) });
  assert.equal(report.sources[0]!.status, "partial");
  assert.equal(report.observations[0]!.availableGpus, null);
});

test("Vast, Lambda and Shadeform price and availability adapters remain supplier-scoped", async () => {
  const report = await collectComputeMarket({ sources: ["vast", "lambda", "shadeform"], credentials: {
    vast: "vast-key", lambda: "lambda-key", shadeform: "shade-key",
  } }, { now, fetch: stub(url => {
    if (url.includes("vast.ai")) return { offers: [{ id: 42, gpu_name: "RTX_4090", num_gpus: 2, dph_total: 0.8, verified: true }] };
    if (url.includes("lambda.ai")) return { data: { gpu_1x: { instance_type: {
      gpu_description: "H100", price_cents_per_hour: 200, specs: { gpus: 1 },
    }, regions_with_capacity_available: [{ name: "eu-west-1" }] } } };
    return { instance_types: [{ id: "shade1", cloud: "runpod", configuration: { gpu_type: "H100", num_gpus: 1 },
      availability: [{ available: true, region: "us-east-1", rental_type: "spot", hourly_price: 125 }] }] };
  }) });
  assert.deepEqual(report.sources.map(s => s.status), ["ok", "ok", "ok"]);
  assert.equal(report.observations.length, 3);
  assert.equal(report.observations[0]!.priceUsdPerGpuHour, 0.4);
  assert.equal(report.observations[0]!.capacityBasis, "offer_quantity");
  assert.equal(report.observations[1]!.priceUsdPerGpuHour, 2);
  assert.equal(report.observations[1]!.availableGpus, null);
  assert.equal(report.observations[2]!.priceUsdPerGpuHour, 1.25);
  assert.equal(report.observations[2]!.availableGpus, null);
});

test("RunPod uses v2 discovery with stock query but does not fabricate numeric supply", async () => {
  const report = await collectComputeMarket({ sources: ["runpod"], credentials: { runpod: "key" } }, {
    now, fetch: stub(url => {
      assert.equal(url, "https://api.runpod.io/v2/catalog/gpus?include=AVAILABILITY&product=POD");
      return { data: [{ id: "NVIDIA H100", name: "H100", maxGpuCount: 8, availability: [] }] };
    }),
  });
  assert.equal(report.sources[0]!.status, "partial");
  assert.equal(report.observations[0]!.availableGpus, null);
  assert.equal(report.observations[0]!.details.availabilityProvided, true);
});

test("ZeroGPU is a Space API, never a public rentable GPU pool", async () => {
  const noConfig = await collectComputeMarket({ sources: ["zerogpu"] }, { now, fetch: stub(() => { throw Error("unreachable"); }) });
  assert.equal(noConfig.sources[0]!.status, "configuration_required");
  const report = await collectComputeMarket({ sources: ["zerogpu"], zeroGpuSpaces: ["demo/space"] }, {
    now, fetch: stub(() => ({ runtime: { hardware: "zero-a10g", stage: "RUNNING" } })),
  });
  assert.equal(report.sources[0]!.status, "partial");
  assert.equal(report.observations[0]!.kind, "space_endpoint");
  assert.equal(report.observations[0]!.availableGpus, null);
});

test("failed or malformed suppliers never contribute partial or untrusted records", async () => {
  const unauthorized = await collectComputeMarket({ sources: ["vast"], credentials: { vast: "bad" } }, {
    now, fetch: stub(() => new Response("forbidden", { status: 401 })),
  });
  assert.equal(unauthorized.sources[0]!.status, "unauthorized");
  assert.equal(unauthorized.observations.length, 0);
  const malformed = await collectComputeMarket({ sources: ["akash", "openrouter"] }, {
    now, fetch: stub(url => url.includes("akash") ? { wrong: true } : { data: [] }),
  });
  assert.deepEqual(malformed.sources.map(s => s.status), ["invalid_payload", "ok"]);
  assert.equal(malformed.observations.length, 0);
});

test("unique sources and bounded HTTP timeouts are validated", async () => {
  await assert.rejects(collectComputeMarket({ sources: ["akash", "akash"] }), /unique known/);
  await assert.rejects(collectComputeMarket({ sources: ["fake" as never] }), /unique known/);
  await assert.rejects(collectComputeMarket({ timeoutMs: 0 }), /timeoutMs/);
  assert.ok(COMPUTE_SCOUT_SOURCES.includes("salad"));
});
