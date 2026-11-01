import { createHash } from "node:crypto";

/** Source observations are NOT normalized, deliverable ComputeSnapshot capacity. */
export const COMPUTE_SCOUT_SOURCES = ["akash", "openrouter", "salad", "vast", "runpod", "lambda", "shadeform", "zerogpu"] as const;
export type ComputeScoutSource = typeof COMPUTE_SCOUT_SOURCES[number];

export interface ComputeMarketObservation {
  source: ComputeScoutSource;
  sourceUrl: string;
  observedAt: string;
  reference: string;
  kind: "gpu_capacity" | "gpu_offer" | "gpu_class" | "model_catalog" | "space_endpoint";
  region: string | null;
  country: string | null;
  gpuType: string | null;
  /** Populated only when the supplier's quantity has a defensible scope. */
  availableGpus: number | null;
  availability: boolean | null;
  /** No conversion to normalized CU without workload benchmarks. */
  priceUsdPerGpuHour: number | null;
  priceUsdPerMillionInputTokens: number | null;
  priceUsdPerMillionOutputTokens: number | null;
  capacityBasis: "provider_total" | "offer_quantity" | "query_tier" | "catalog_only";
  details: Record<string, string | number | boolean | null>;
}

export interface ComputeScoutSourceResult {
  source: ComputeScoutSource;
  status: "ok" | "partial" | "credentials_required" | "configuration_required" | "unauthorized" | "rate_limited" | "http_error" | "invalid_payload" | "network_error";
  records: number;
  reason?: string;
  httpStatus?: number;
}

export interface ComputeMarketSnapshot {
  version: 1;
  kind: "market_observations_not_calibrated_capacity";
  mode: "read_only";
  observedAt: string;
  sources: ComputeScoutSourceResult[];
  observations: ComputeMarketObservation[];
  digest: string;
  limits: string[];
}

export interface ComputeScoutOptions {
  sources?: ComputeScoutSource[];
  timeoutMs?: number;
  credentials?: Partial<Record<"salad" | "vast" | "runpod" | "lambda" | "shadeform", string>>;
  saladOrganization?: string;
  saladGpuClassIds?: string[];
  saladCountryCodes?: string[];
  saladResources?: { cpu: number; memory: number; storageAmount: number };
  zeroGpuSpaces?: string[];
}

export interface ComputeScoutDependencies {
  fetch?: typeof fetch;
  now?: () => Date;
}

type JsonObject = Record<string, unknown>;
type Row = JsonObject;

const isObject = (value: unknown): value is JsonObject => value !== null && typeof value === "object" && !Array.isArray(value);
const obj = (value: unknown): JsonObject => isObject(value) ? value : {};
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const str = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;
const count = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const price = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const bool = (value: unknown): boolean | null => typeof value === "boolean" ? value : null;
const sha = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

class FetchFailure extends Error {
  constructor(readonly status: number) { super(`HTTP ${status}`); }
}

function requiredRows(value: unknown, label: string): Row[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.filter(isObject);
}

function record(source: ComputeScoutSource, sourceUrl: string, observedAt: string, fields: Omit<ComputeMarketObservation, "source" | "sourceUrl" | "observedAt">): ComputeMarketObservation {
  return { source, sourceUrl, observedAt, ...fields };
}

/** Read-only observations; supplier catalogs and offer counts cannot prove total global capacity. */
export async function collectComputeMarket(options: ComputeScoutOptions = {}, dependencies: ComputeScoutDependencies = {}): Promise<ComputeMarketSnapshot> {
  const sources = options.sources ?? ["akash", "openrouter"];
  if (!Array.isArray(sources) || new Set(sources).size !== sources.length || sources.some(s => !(COMPUTE_SCOUT_SOURCES as readonly string[]).includes(s))) {
    throw new Error("sources must be unique known provider names");
  }
  const timeoutMs = options.timeoutMs ?? 15000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) throw new Error("timeoutMs must be 100..120000");
  const now = (dependencies.now ?? (() => new Date()))().toISOString();
  const transport = dependencies.fetch ?? globalThis.fetch;
  const observations: ComputeMarketObservation[] = [];
  const results: ComputeScoutSourceResult[] = [];
  const fetchJson = async (url: string, init: RequestInit = {}): Promise<unknown> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await transport(url, { ...init, signal: controller.signal, redirect: "error" });
      if (!response.ok) throw new FetchFailure(response.status);
      const raw = await response.text();
      if (raw.length > 12_000_000) throw new Error("response exceeds 12 MB limit");
      try { return JSON.parse(raw) as unknown; }
      catch { throw new Error("invalid JSON response"); }
    } finally { clearTimeout(timer); }
  };
  const auth = (source: keyof NonNullable<ComputeScoutOptions["credentials"]>): string | null => str(options.credentials?.[source]);
  const bearer = (token: string): HeadersInit => ({ Authorization: `Bearer ${token}` });

  for (const source of sources) {
    const before = observations.length;
    let partial = false;
    try {
      if (source === "akash") {
        const url = "https://console-api.akash.network/v1/providers";
        for (const provider of requiredRows(await fetchJson(url), "Akash providers")) {
          const stats = obj(obj(provider.stats).gpu);
          const models = arr(provider.gpuModels).map(m => str(obj(m).model)).filter((m): m is string => !!m);
          const ref = str(provider.owner);
          if (!ref) continue;
          const available = count(stats.available);
          observations.push(record(source, url, now, {
            reference: ref, kind: "gpu_capacity", region: str(provider.ipRegionCode), country: str(provider.ipCountryCode),
            gpuType: models.length === 1 ? models[0]! : null,
            availableGpus: available, availability: bool(provider.isOnline) === false ? false : available === null ? null : available > 0,
            priceUsdPerGpuHour: null, priceUsdPerMillionInputTokens: null, priceUsdPerMillionOutputTokens: null,
            capacityBasis: "provider_total", details: { gpuModelCount: models.length, activeGpus: count(stats.active), pendingGpus: count(stats.pending), totalGpus: count(stats.total), online: bool(provider.isOnline) },
          }));
        }
      } else if (source === "openrouter") {
        const url = "https://openrouter.ai/api/v1/models";
        for (const model of requiredRows(obj(await fetchJson(url)).data, "OpenRouter models")) {
          const ref = str(model.id);
          if (!ref) continue;
          const p = obj(model.pricing);
          const input = price(p.prompt);
          const output = price(p.completion);
          observations.push(record(source, url, now, {
            reference: ref, kind: "model_catalog", region: null, country: null, gpuType: null,
            availableGpus: null, availability: null, priceUsdPerGpuHour: null,
            priceUsdPerMillionInputTokens: input === null ? null : input * 1_000_000,
            priceUsdPerMillionOutputTokens: output === null ? null : output * 1_000_000,
            capacityBasis: "catalog_only", details: { contextLength: count(model.context_length), name: str(model.name) },
          }));
        }
      } else if (source === "salad") {
        const token = auth("salad");
        if (!token) { results.push({ source, status: "credentials_required", records: 0 }); continue; }
        const org = str(options.saladOrganization);
        if (!org || !/^[a-zA-Z0-9-]+$/.test(org)) { results.push({ source, status: "configuration_required", records: 0, reason: "saladOrganization is required" }); continue; }
        const base = `https://api.salad.com/api/public/organizations/${org}`;
        const headers = { "Salad-Api-Key": token, "Content-Type": "application/json" };
        const classesUrl = `${base}/gpu-classes`;
        const classes = requiredRows(obj(await fetchJson(classesUrl, { headers })).items, "Salad GPU classes");
        const known = new Map(classes.filter(c => str(c.id)).map(c => [str(c.id)!, str(c.name)]));
        for (const [id, name] of known) {
          observations.push(record(source, classesUrl, now, {
            reference: id, kind: "gpu_class", region: null, country: null, gpuType: name,
            availableGpus: null, availability: null, priceUsdPerGpuHour: null,
            priceUsdPerMillionInputTokens: null, priceUsdPerMillionOutputTokens: null,
            capacityBasis: "catalog_only", details: {},
          }));
        }
        const requested = options.saladGpuClassIds ?? [];
        if (requested.length === 0) partial = true;
        if (requested.length > 24) throw new Error("Salad availability checks limited to 24 GPU classes per run");
        const resources = options.saladResources ?? { cpu: 4, memory: 8192, storageAmount: 1_000_000_000 };
        for (const id of requested) {
          if (!known.has(id)) throw new Error("Salad GPU class is not in the organization catalog");
          const url = `${base}/availability/sce-gpu-availability`;
          const response = obj(await fetchJson(url, { method: "POST", headers, body: JSON.stringify({
            gpu_classes: [id], country_codes: options.saladCountryCodes ?? [],
            cpu: resources.cpu, memory: resources.memory, storage_amount: resources.storageAmount,
          }) }));
          for (const [tier, key] of [["high", "available_gpu_high"], ["medium", "available_gpu_medium"], ["low", "available_gpu_low"], ["batch", "available_gpu_batch"]] as const) {
            const available = count(response[key]);
            observations.push(record(source, url, now, {
              reference: `${id}:${tier}`, kind: "gpu_capacity", region: null, country: options.saladCountryCodes?.length === 1 ? options.saladCountryCodes[0]! : null,
              gpuType: known.get(id) ?? null, availableGpus: available, availability: available === null ? null : available > 0,
              priceUsdPerGpuHour: null, priceUsdPerMillionInputTokens: null, priceUsdPerMillionOutputTokens: null,
              capacityBasis: "query_tier", details: { tier, cpu: resources.cpu, memory: resources.memory, storageAmount: resources.storageAmount, overlappingTiers: true },
            }));
          }
        }
      } else if (source === "vast") {
        const token = auth("vast");
        if (!token) { results.push({ source, status: "credentials_required", records: 0 }); continue; }
        const url = `https://cloud.vast.ai/api/v0/bundles/?q=${encodeURIComponent(JSON.stringify({ verified: true }))}`;
        const offers = requiredRows(obj(await fetchJson(url, { headers: bearer(token) })).offers, "Vast offers");
        for (const offer of offers) {
          const id = offer.id;
          if (id === undefined || id === null) continue;
          const gpus = count(offer.num_gpus);
          observations.push(record(source, url, now, {
            reference: String(id), kind: "gpu_offer", region: str(offer.geolocation), country: null,
            gpuType: str(offer.gpu_name), availableGpus: gpus, availability: gpus === null ? null : gpus > 0,
            priceUsdPerGpuHour: gpus && price(offer.dph_total) !== null ? price(offer.dph_total)! / gpus : null,
            priceUsdPerMillionInputTokens: null, priceUsdPerMillionOutputTokens: null,
            capacityBasis: "offer_quantity", details: { reliability: count(offer.reliability), verified: bool(offer.verified) },
          }));
        }
      } else if (source === "runpod") {
        const token = auth("runpod");
        if (!token) { results.push({ source, status: "credentials_required", records: 0 }); continue; }
        const url = "https://api.runpod.io/v2/catalog/gpus?include=AVAILABILITY&product=POD";
        const response = await fetchJson(url, { headers: bearer(token) });
        const root = obj(response);
        const entries = Array.isArray(response) ? response : Array.isArray(root.data) ? root.data : Array.isArray(obj(root.data).items) ? obj(root.data).items : root.items;
        for (const gpu of requiredRows(entries, "RunPod GPUs")) {
          const id = str(gpu.id) ?? str(gpu.name);
          if (!id) continue;
          observations.push(record(source, url, now, {
            reference: id, kind: "gpu_class", region: null, country: null,
            gpuType: str(gpu.displayName) ?? str(gpu.name) ?? id,
            availableGpus: null, availability: null, priceUsdPerGpuHour: price(gpu.securePrice) ?? price(gpu.communityPrice),
            priceUsdPerMillionInputTokens: null, priceUsdPerMillionOutputTokens: null,
            capacityBasis: "catalog_only", details: { availabilityProvided: gpu.availability !== undefined, maxGpuCount: count(gpu.maxGpuCount) },
          }));
        }
        partial = true; // Stock details are versioned and must be calibrated per cloud/data center.
      } else if (source === "lambda") {
        const token = auth("lambda");
        if (!token) { results.push({ source, status: "credentials_required", records: 0 }); continue; }
        const url = "https://cloud.lambda.ai/api/v1/instance-types";
        const data = obj(obj(await fetchJson(url, { headers: bearer(token) })).data);
        for (const [key, value] of Object.entries(data)) {
          const shape = obj(value);
          const instance = obj(shape.instance_type);
          const gpus = count(obj(instance.specs).gpus);
          const totalPrice = price(instance.price_cents_per_hour);
          for (const region of arr(shape.regions_with_capacity_available)) {
            const regionName = str(obj(region).name);
            if (!regionName) continue;
            observations.push(record(source, url, now, {
              reference: `${key}:${regionName}`, kind: "gpu_offer", region: regionName, country: null,
              gpuType: str(instance.gpu_description), availableGpus: null, availability: true,
              priceUsdPerGpuHour: gpus && totalPrice !== null ? totalPrice / 100 / gpus : null,
              priceUsdPerMillionInputTokens: null, priceUsdPerMillionOutputTokens: null,
              capacityBasis: "catalog_only", details: { gpusPerInstance: gpus },
            }));
          }
        }
      } else if (source === "shadeform") {
        const token = auth("shadeform");
        if (!token) { results.push({ source, status: "credentials_required", records: 0 }); continue; }
        const url = "https://api.shadeform.ai/v1/instances/types?available=true";
        const root = obj(await fetchJson(url, { headers: { "X-API-KEY": token } }));
        const items = requiredRows(root.instance_types ?? root.data, "Shadeform instance types");
        for (const item of items) {
          const availability = arr(item.availability);
          const gpuName = str(obj(item.configuration).gpu_type);
          const gpuCount = count(obj(item.configuration).num_gpus);
          for (const variant of availability) {
            const row = obj(variant);
            const region = str(row.region);
            if (!region) continue;
            const isAvailable = bool(row.available);
            const totalCents = price(row.hourly_price) ?? price(item.hourly_price);
            observations.push(record(source, url, now, {
              reference: `${str(item.id) ?? gpuName ?? "unknown"}:${region}:${str(row.rental_type) ?? "standard"}`,
              kind: "gpu_offer", region, country: null, gpuType: gpuName, availableGpus: null, availability: isAvailable,
              priceUsdPerGpuHour: gpuCount && totalCents !== null ? totalCents / 100 / gpuCount : null,
              priceUsdPerMillionInputTokens: null, priceUsdPerMillionOutputTokens: null,
              capacityBasis: "catalog_only", details: { rentalType: str(row.rental_type), cloud: str(item.cloud) },
            }));
          }
        }
      } else if (source === "zerogpu") {
        const spaces = options.zeroGpuSpaces ?? [];
        if (!spaces.length) { results.push({ source, status: "configuration_required", records: 0, reason: "provide ZeroGPU Space slugs; not a GPU inventory API" }); continue; }
        if (spaces.length > 20 || spaces.some(s => !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(s))) throw new Error("zeroGpuSpaces must contain at most 20 valid owner/space slugs");
        for (const slug of spaces) {
          const url = `https://huggingface.co/api/spaces/${slug}`;
          const space = obj(await fetchJson(url));
          const hardware = str(obj(space.runtime).hardware) ?? str(space.hardware);
          if (hardware !== "zero-a10g") continue;
          observations.push(record(source, url, now, {
            reference: slug, kind: "space_endpoint", region: null, country: null, gpuType: null,
            availableGpus: null, availability: null, priceUsdPerGpuHour: null,
            priceUsdPerMillionInputTokens: null, priceUsdPerMillionOutputTokens: null,
            capacityBasis: "catalog_only", details: { hardware, stage: str(obj(space.runtime).stage) },
          }));
        }
        partial = true; // Executable Spaces have personal quota, not public inventory.
      }
      results.push({ source, status: partial ? "partial" : "ok", records: observations.length - before,
        ...(partial ? { reason: source === "salad" ? "GPU classes read; set class IDs to query live availability" : "catalog / endpoint visibility only, not proven free capacity" } : {}) });
    } catch (error) {
      observations.splice(before); // A failed source contributes no partial evidence.
      const httpStatus = error instanceof FetchFailure ? error.status : undefined;
      const status = httpStatus === 401 || httpStatus === 403 ? "unauthorized"
        : httpStatus === 429 ? "rate_limited"
        : httpStatus ? "http_error"
        : error instanceof TypeError || (error instanceof Error && error.name === "AbortError") ? "network_error" : "invalid_payload";
      results.push({ source, status, records: 0, reason: httpStatus ? `HTTP ${httpStatus}` : error instanceof Error ? error.message : "unknown error",
        ...(httpStatus ? { httpStatus } : {}) });
    }
  }
  return { version: 1, kind: "market_observations_not_calibrated_capacity", mode: "read_only", observedAt: now,
    sources: results, observations, digest: sha({ now, results, observations }),
    limits: ["Provider-listed offers are not verified deliverable capacity or a complete global supply census.",
      "Provider-level counts must not be attributed to one GPU model when multiple models are present.",
      "Salad availability tiers overlap and must never be summed; query results depend on CPU/memory/storage and regions.",
      "Model-token prices and GPU-hour prices are different units; neither implies calibrated Solland demand, eta, mu or R_S.",
      "All calls are read-only observations; no workload is booked, deployed, purchased or authorized."],
  };
}
