/**
 * Deterministic, offline scenario sampling for intelligence compilation.
 * Callers supply a domain world-model. Synthetic outcomes are not real-world evidence.
 * No flight, tool, or physical execution occurs.
 */
import type { Outcome } from "./intelligence-compilation.js";
export type SimulatedResult = { reward: number; safe: boolean };
export type WorldModel = (input: { state: string; action: string; random: () => number; trial: number }) => SimulatedResult;
export type SimulationSpec = {
  states: readonly string[];
  actions: readonly string[];
  trialsPerAction: number;
  holdoutFraction?: number;
  seed: number;
};
function randomGenerator(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
export function simulateScenarios(spec: SimulationSpec, world: WorldModel): Outcome[] {
  const { states, actions, trialsPerAction, seed } = spec;
  const holdoutFraction = spec.holdoutFraction ?? 0.2;
  if (!Number.isInteger(seed) || !Number.isSafeInteger(trialsPerAction) || trialsPerAction < 2 ||
      !Number.isFinite(holdoutFraction) || holdoutFraction <= 0 || holdoutFraction >= 1 ||
      !states.length || !actions.length || [...states,...actions].some(s=>typeof s!=="string"||!s.trim()) ||
      new Set(states).size!==states.length || new Set(actions).size!==actions.length ||
      states.length * actions.length * trialsPerAction > 1000000) throw new Error("invalid simulation spec");
  const output: Outcome[] = [];
  for (const [stateIndex,state] of states.entries()) {
    for (const [actionIndex,action] of actions.entries()) {
      for (let trial=0;trial<trialsPerAction;trial++) {
        // Independent streams prevent candidate iteration order from changing a scenario's RNG.
        const localSeed = (seed ^ Math.imul(stateIndex+1, 0x9e3779b1) ^ Math.imul(actionIndex+1, 0x85ebca6b) ^ trial) >>> 0;
        const result = world({state,action,random:randomGenerator(localSeed),trial});
        if (!result || !Number.isFinite(result.reward) || typeof result.safe!=="boolean") throw new Error("invalid world model output");
        output.push({scenarioId:`sim:${stateIndex}:${actionIndex}:${trial}`,state,action,reward:result.reward,safe:result.safe,partition:trial < Math.floor(trialsPerAction*(1-holdoutFraction)) ? "train" : "holdout"});
      }
    }
  }
  return output;
}
