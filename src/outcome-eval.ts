/**
 * End-to-end evaluation of agent routing strategies.
 * Decision confidence is never accepted as outcome verification.
 * No execution or authorization is performed by this module.
 */
export type EvaluationArm = "single_model" | "rules" | "jev" | "exup" | (string & {});

export interface TaskOutcome {
  task_id: string;
  arm: EvaluationArm;
  verified_success: boolean;
  verifier_id: string;
  total_cost_usd: number;
  elapsed_ms: number;
  model_calls: number;
  cache_hits: number;
  model_switches: number;
  retries: number;
  unauthorized_effects: number;
  failure_state?: boolean;
}

export interface ArmSummary {
  arm: EvaluationArm;
  tasks: number;
  verified_successes: number;
  success_rate: number;
  total_cost_usd: number;
  cost_per_verified_success_usd: number | null;
  mean_elapsed_ms: number;
  cache_hits: number;
  model_switches: number;
  retries: number;
  unauthorized_effects: number;
  failure_state_tasks: number;
}

export function summarizeOutcomes(outcomes: readonly TaskOutcome[]): ArmSummary[] {
  const seen = new Set<string>();
  const groups = new Map<string, TaskOutcome[]>();
  for (const entry of outcomes) {
    if (!entry.task_id || !entry.arm || !entry.verifier_id) throw new Error("task_id, arm and independent verifier_id are required");
    if (!Number.isFinite(entry.total_cost_usd) || entry.total_cost_usd < 0 || !Number.isFinite(entry.elapsed_ms) || entry.elapsed_ms < 0) throw new Error("invalid cost or elapsed time");
    for (const key of ["model_calls", "cache_hits", "model_switches", "retries", "unauthorized_effects"] as const) {
      if (!Number.isSafeInteger(entry[key]) || entry[key] < 0) throw new Error("invalid " + key);
    }
    const id = JSON.stringify([entry.arm, entry.task_id]);
    if (seen.has(id)) throw new Error("duplicate arm/task pair: " + id);
    seen.add(id);
    const group = groups.get(entry.arm) ?? [];
    group.push(entry);
    groups.set(entry.arm, group);
  }
  return [...groups].map(([arm, entries]) => {
    const sum = (key: "total_cost_usd" | "elapsed_ms" | "cache_hits" | "model_switches" | "retries" | "unauthorized_effects") =>
      entries.reduce((n, e) => n + e[key], 0);
    const successes = entries.filter(e => e.verified_success).length;
    return {
      arm, tasks: entries.length, verified_successes: successes,
      success_rate: successes / entries.length,
      total_cost_usd: sum("total_cost_usd"),
      cost_per_verified_success_usd: successes ? sum("total_cost_usd") / successes : null,
      mean_elapsed_ms: sum("elapsed_ms") / entries.length,
      cache_hits: sum("cache_hits"), model_switches: sum("model_switches"),
      retries: sum("retries"), unauthorized_effects: sum("unauthorized_effects"),
      failure_state_tasks: entries.filter(e => e.failure_state).length,
    };
  }).sort((a, b) => a.arm.localeCompare(b.arm));
}

/** Require paired tasks to prevent comparing unlike benchmark sets. */
export function requirePairedTasks(outcomes: readonly TaskOutcome[]): void {
  const byArm = new Map<string, Set<string>>();
  for (const o of outcomes) {
    const set = byArm.get(o.arm) ?? new Set();
    set.add(o.task_id);
    byArm.set(o.arm, set);
  }
  const arms = [...byArm.values()];
  if (arms.length < 2) throw new Error("at least two comparison arms required");
  const first = [...arms[0]].sort().join("\u0000");
  if (arms.some(a => [...a].sort().join("\u0000") !== first)) throw new Error("unpaired task sets");
}
