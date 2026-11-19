#!/usr/bin/env python3
"""Pure-stdlib CPU measurement of a *learned synthetic student*, NOT Jev.

Synthetic scenario rules are a diagnostic oracle only, never safety evidence.
"""
import argparse
import hashlib
import json
from math import ceil
from pathlib import Path
import random
import time
from compact_student_runtime import FEATURE_NAMES, choose, load_artifact

def run(artifact, samples=5000, repetitions=3, seed=1888):
    if not 100 <= samples <= 50000 or not 1 <= repetitions <= 10:
        raise ValueError("invalid benchmark bounds")
    rng = random.Random(seed)
    states = []
    for _ in range(samples):
        values = (rng.random(), rng.random()*30, rng.random()*25, rng.random(), rng.random())
        states.append(dict(zip(FEATURE_NAMES, values)))
    for _ in range(500):
        choose(artifact, states[0])
    results = []
    for rep in range(repetitions):
        times = []
        accepted = incompatible = 0
        for state in states:
            start = time.perf_counter_ns()
            choice = choose(artifact, state)
            times.append((time.perf_counter_ns()-start)/1e6)
            action = choice["action"]
            if action is None:
                continue
            accepted += 1
            battery, obstacle, wind, link, sensor = [state[k] for k in FEATURE_NAMES]
            expected = (-1 if sensor < 0.35 else
                        2 if battery < 0.20 or link < 0.20 else
                        1 if obstacle < 3.0 or wind > 18.0 else 0)
            if (expected == -1 or
                (expected == 2 and action != "return") or
                (expected == 1 and action == "inspect")):
                incompatible += 1
        times.sort()
        at = lambda p: round(times[max(0,ceil(p*len(times))-1)],6)
        results.append({
            "iteration":rep+1,"samples":samples,
            "accepted":accepted,"abstained":samples-accepted,
            "synthetic_rule_incompatible":incompatible,
            "p50_ms":at(0.5),"p95_ms":at(0.95),
            "p99_ms":at(0.99),"max_ms":round(times[-1],6)
        })
    return results

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--artifact",default=str(Path(__file__).resolve().parents[1] /
                        "examples/intelligence/synthetic-student-v1.json"))
    parser.add_argument("--samples",type=int,default=5000)
    parser.add_argument("--repetitions",type=int,default=3)
    args=parser.parse_args()
    path=Path(args.artifact)
    model=load_artifact(path)
    print(json.dumps({
        "kind":"synthetic_learned_student_cpu_only",
        "model_is_jev":False,"network":False,
        "uses_training_libraries":False,
        "file_sha256":hashlib.sha256(path.read_bytes()).hexdigest(),
        "measurements":run(model,args.samples,args.repetitions),
        "limitations":"Synthetic teacher; no field safety, calibrated confidence, drone hardware or Jev inference"
    },sort_keys=True))
if __name__=="__main__":main()
