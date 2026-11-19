#!/usr/bin/env python3
"""Synthetic offline teacher -> small student -> portable JSON artifact.

CPU-only; no external requests, no physical control, not trained Jev weights.
"""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import random
import statistics
import time
import torch
from compact_student_runtime import ACTIONS, FEATURE_NAMES, choose, load_artifact

def label(v):
    battery, obstacle, wind, link, sensor = v
    if sensor < 0.35:
        return -1
    if battery < 0.20 or link < 0.20:
        return 2
    if obstacle < 3.0 or wind > 18.0:
        return 1
    return 0

def generate(seed, count):
    random_source = random.Random(seed)
    raw = [[random_source.random(), random_source.uniform(0,30), random_source.uniform(0,25),
            random_source.random(), random_source.random()] for _ in range(count)]
    x, y = [], []
    for v in raw:
        target = label(v)
        if target < 0:
            continue
        x.append([v[0], v[1]/30, v[2]/25, v[3], v[4]])
        y.append(target)
    return torch.tensor(x, dtype=torch.float32), torch.tensor(y, dtype=torch.long)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--artifact", default="/tmp/intelligence-student-v1.json")
    ap.add_argument("--epochs",type=int,default=120)
    ap.add_argument("--train-count",type=int,default=12000)
    ap.add_argument("--test-count",type=int,default=3000)
    args=ap.parse_args()
    if not 10 <= args.epochs <= 1000 or not 500 <= args.train_count <= 100000 or not 500 <= args.test_count <= 20000:
        raise SystemExit("invalid limits")
    torch.manual_seed(19)
    torch.set_num_threads(1)
    train_x,train_y=generate(42,args.train_count)
    test_x,test_y=generate(888,args.test_count)
    model=torch.nn.Sequential(torch.nn.Linear(5,16),torch.nn.ReLU(),torch.nn.Linear(16,3))
    optimizer=torch.optim.Adam(model.parameters(),lr=0.015)
    for epoch in range(args.epochs):
        model.train()
        for indices in torch.randperm(len(train_x)).split(256):
            optimizer.zero_grad()
            loss=torch.nn.functional.cross_entropy(model(train_x[indices]),train_y[indices])
            loss.backward();optimizer.step()
    model.eval()
    with torch.inference_mode():
        predictions=model(test_x).argmax(dim=1)
        accuracy=(predictions==test_y).float().mean().item()
    linear1=model[0];linear2=model[2]
    layers=[]
    for layer in (linear1,linear2):
        layers.append({"w":layer.weight.detach().cpu().tolist(),"b":layer.bias.detach().cpu().tolist()})
    obj={"schema":"intelligence.compact-student.v1","features":list(FEATURE_NAMES),
         "actions":list(ACTIONS),"layers":layers,"training_source":"deterministic_synthetic_teacher",
         "model_architecture":"5-16-relu-3"}
    canonical=json.dumps(obj,sort_keys=True,separators=(",",":"),allow_nan=False).encode()
    obj["sha256"]=sha256(canonical).hexdigest()
    destination=Path(args.artifact)
    destination.write_text(json.dumps(obj,sort_keys=True,separators=(",",":")))
    loaded=load_artifact(destination)
    rng=random.Random(991)
    observations=[{"battery":rng.random(),"obstacle_m":rng.random()*30,"wind_mps":rng.random()*25,
                   "link":rng.random(),"sensor":rng.random()} for _ in range(500)]
    for _ in range(200):choose(loaded,observations[0])
    times=[]
    outcomes={"choice":0,"no_decision":0}
    for o in observations:
        t0=time.perf_counter_ns()
        decision=choose(loaded,o)
        times.append((time.perf_counter_ns()-t0)/1e6)
        outcomes[decision["status"]]+=1
    times.sort()
    def pct(q):return round(times[min(len(times)-1,int((len(times)-1)*q))],6)
    print(json.dumps({"artifact":str(destination),"sha256":obj["sha256"],"bytes":destination.stat().st_size,
        "synthetic_heldout_accuracy":round(accuracy,4),"heldout_n":len(test_y),"train_n":len(train_y),
        "inference":"pure_python_cpu", "latency_ms":{"p50":pct(.5),"p95":pct(.95),"p99":pct(.99)},
        "counts":outcomes,"warning":"SYNTHETIC student policy, not Jev, no real-world safety or drone latency"},sort_keys=True))
if __name__=="__main__":main()
