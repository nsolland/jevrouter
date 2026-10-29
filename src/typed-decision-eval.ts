/** Held-out evaluation for typed decisions, not evidence of authorized execution. */
import { performance } from "node:perf_hooks";
import { getChoiceAnswer } from "./provider.js";
import type { JevProvider, StateValue } from "./types.js";
import { sha256 } from "./utils.js";

export interface LabeledChoiceCase {
  id: string;
  state: StateValue;
  instructions: string;
  criteria: Record<string, string>;
  expected: string;
  task_class: string;
  language: string;
}

export interface ChoiceObservation {
  id: string;
  task_class: string;
  language: string;
  expected: string;
  predicted: string | null;
  confidence: number | null;
  correct: boolean;
  latency_ms: number;
  input_tokens: number | null;
  error: string | null;
}

export interface ChoiceEvaluation {
  provider: string;
  sample_count: number;
  dataset_sha256: string;
  answered: number;
  correct: number;
  accuracy_including_failures: number;
  expected_calibration_error: number | null;
  mean_latency_ms: number;
  total_input_tokens: number | null;
  selective: Array<{ threshold: number; count: number; coverage: number; error_rate: number | null }>;
  by_task_class: Record<string, { count: number; correct: number }>;
  by_language: Record<string, { count: number; correct: number }>;
  observations: ChoiceObservation[];
}

export function validateChoiceHoldout(cases: readonly LabeledChoiceCase[], minCases = 200): void {
  if (cases.length < minCases) throw new Error(`Holdout requires at least ${minCases} labelled cases; received ${cases.length}`);
  const ids = new Set<string>();
  for (const c of cases) {
    if (!c || typeof c !== "object" || !c.id?.trim() || ids.has(c.id)) throw new Error("Holdout case IDs must be unique and nonempty");
    ids.add(c.id);
    if (typeof c.instructions !== "string" || !c.instructions.trim() || !c.task_class?.trim() || !c.language?.trim()) {
      throw new Error(`Holdout case ${c.id}: instructions, task_class and language are required`);
    }
    if (!c.criteria || typeof c.criteria !== "object" || Array.isArray(c.criteria) || Object.keys(c.criteria).length < 2 ||
        Object.values(c.criteria).some(v => typeof v !== "string" || !v.trim()) || !Object.hasOwn(c.criteria, c.expected)) {
      throw new Error(`Holdout case ${c.id}: at least two labelled options including expected are required`);
    }
    if (c.state === undefined || c.state === null) throw new Error(`Holdout case ${c.id}: state is required`);
  }
}

export async function evaluateChoiceHoldout(
  cases: readonly LabeledChoiceCase[],
  provider: JevProvider,
  thresholds: readonly number[] = [0.5, 0.7, 0.9, 0.95, 0.99],
): Promise<ChoiceEvaluation> {
  validateChoiceHoldout(cases, 1);
  if (thresholds.some(t => !Number.isFinite(t) || t < 0 || t > 1)) throw new Error("Invalid confidence threshold");
  const observations: ChoiceObservation[] = [];
  for (const c of cases) {
    const started = performance.now();
    let predicted: string | null = null;
    let confidence: number | null = null;
    let inputTokens: number | null = null;
    let error: string | null = null;
    try {
      const raw = await provider.decide({
        state: c.state,
        candidates: [],
        questions: { label: { type: "choice", instructions: c.instructions, criteria: c.criteria } },
      });
      const answer = getChoiceAnswer(raw, "label");
      if (!Object.hasOwn(c.criteria, answer.choice)) throw new Error("choice_outside_criteria");
      predicted = answer.choice;
      confidence = answer.confidence ?? null;
      const tokenCount = raw.usage?.input_tokens;
      inputTokens = typeof tokenCount === "number" && Number.isFinite(tokenCount) && tokenCount >= 0 ? tokenCount : null;
    } catch (e) {
      // The case must remain in the denominator. Do not serialize provider errors
      // that could echo sensitive state or credentials.
      error = e instanceof Error ? e.name : "ProviderError";
    }
    observations.push({
      id: c.id,
      task_class: c.task_class,
      language: c.language,
      expected: c.expected,
      predicted,
      confidence,
      correct: predicted === c.expected,
      latency_ms: performance.now() - started,
      input_tokens: inputTokens,
      error,
    });
  }
  const answered = observations.filter(o => o.predicted !== null && o.confidence !== null);
  const byGroup = (key: "task_class" | "language") => Object.fromEntries(
    [...new Set(observations.map(o => o[key]))].sort().map(value => {
      const rows = observations.filter(o => o[key] === value);
      return [value, { count: rows.length, correct: rows.filter(o => o.correct).length }];
    }),
  );
  const ece = answered.length === 0 ? null : Array.from({ length: 10 }, (_, bin) => {
    const rows = answered.filter(o => Math.min(9, Math.floor(o.confidence! * 10)) === bin);
    if (rows.length === 0) return 0;
    const accuracy = rows.filter(o => o.correct).length / rows.length;
    const confidence = rows.reduce((sum, o) => sum + o.confidence!, 0) / rows.length;
    return rows.length / answered.length * Math.abs(accuracy - confidence);
  }).reduce((sum, value) => sum + value, 0);
  return {
    provider: provider.name,
    sample_count: cases.length,
    dataset_sha256: sha256(cases),
    answered: answered.length,
    correct: observations.filter(o => o.correct).length,
    accuracy_including_failures: observations.filter(o => o.correct).length / cases.length,
    expected_calibration_error: ece,
    mean_latency_ms: observations.reduce((sum, o) => sum + o.latency_ms, 0) / cases.length,
    total_input_tokens: observations.every(o => o.input_tokens !== null)
      ? observations.reduce((sum, o) => sum + o.input_tokens!, 0) : null,
    selective: thresholds.map(threshold => {
      const selected = answered.filter(o => o.confidence! >= threshold);
      return {
        threshold,
        count: selected.length,
        coverage: selected.length / cases.length,
        error_rate: selected.length ? selected.filter(o => !o.correct).length / selected.length : null,
      };
    }),
    by_task_class: byGroup("task_class"),
    by_language: byGroup("language"),
    observations,
  };
}
