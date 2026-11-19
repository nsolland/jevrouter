#!/usr/bin/env python3
"""Offline synthetic teacher -> compact learned MLP -> portable pure-Python inference.

Uses scikit-learn (CPU) at training time only, no PyTorch, no network.
This is NOT the Jev model and not validated on a real drone.
"""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import random
import time
import numpy as np
from sklearn.neural_network import MLPClassifier
from compact_student_runtime import ACTIONS, FEATURE_NAMES, choose, load_artifact

def label(v):
    battery, obstacle, wind, link, sensor = v
    if sensor < 0.35: return -1
    if battery < 0.20 or link < 0.20: return 2
    if obstacle < 3.0 or wind > 18.0: return 1
    return 0

def generate(seed, count):
    rng=random.Random(seed)
    rows=[]
    targets=[]
    for _ in range(count):
        v=[rng.random(),rng.uniform(0,30),rng.uniform(0,25),rng.random(),rng.random()]
        y=label(v)
        if y<0:continue
        rows.append([v[0],v[1]/30,v[2]/25,v[3],v[4]])
        targets.append(y)
    return np.array(rows,dtype=np.float64), np.array(targets,dtype=np.int64)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--artifact",default="/tmp/intelligence-student-v1.json")
    parser.add_argument("--epochs",type=int,default=80)
    parser.add_argument("--train-count",type=int,default=6000)
    parser.add_argument("--test-count",type=int,default=2000)
    args=parser.parse_args()
    if not 5<=args.epochs<=500 or not 500<=args.train_count<=100000 or not 500<=args.test_count<=20000:
        raise SystemExit("invalid limits")
    train_x,train_y=generate(42,args.train_count)
    test_x,test_y=generate(888,args.test_count)
    model=MLPClassifier(hidden_layer_sizes=(16,),activation="relu",solver="adam",
         learning_rate_init=0.01,batch_size=128,max_iter=args.epochs,random_state=19,
         tol=1e-5,n_iter_no_change=20)
    model.fit(train_x,train_y)
    if list(model.classes_) != [0,1,2]: raise RuntimeError("student classes mismatch")
    accuracy=float(np.mean(model.predict(test_x)==test_y))
    layers=[]
    for weights,bias in zip(model.coefs_,model.intercepts_):
        layers.append({"w":weights.T.tolist(),"b":bias.tolist()})
    artifact={"schema":"intelligence.compact-student.v1","features":list(FEATURE_NAMES),
       "actions":list(ACTIONS),"layers":layers,"training_source":"deterministic_synthetic_teacher",
       "model_architecture":"5-16-relu-3"}
    canonical=json.dumps(artifact,sort_keys=True,separators=(",",":"),allow_nan=False).encode()
    artifact["sha256"]=sha256(canonical).hexdigest()
    path=Path(args.artifact)
    path.write_text(json.dumps(artifact,sort_keys=True,separators=(",",":")))
    loaded=load_artifact(path)
    rng=random.Random(991)
    observations=[{"battery":rng.random(),"obstacle_m":rng.random()*30,"wind_mps":rng.random()*25,
                   "link":rng.random(),"sensor":rng.random()} for _ in range(500)]
    for _ in range(200):choose(loaded,observations[0])
    times=[]; counts={"choice":0,"no_decision":0}
    for row in observations:
        start=time.perf_counter_ns()
        answer=choose(loaded,row)
        times.append((time.perf_counter_ns()-start)/1000000)
        counts[answer["status"]]+=1
    times.sort()
    def percentile(p):return round(times[min(len(times)-1,int((len(times)-1)*p))],6)
    print(json.dumps({"artifact":str(path),"sha256":artifact["sha256"],"bytes":path.stat().st_size,
       "synthetic_heldout_accuracy":round(accuracy,4),"train_n":len(train_y),"heldout_n":len(test_y),
       "training_epochs":model.n_iter_,"inference":"pure_python_cpu",
       "latency_ms":{"p50":percentile(.5),"p95":percentile(.95),"p99":percentile(.99)},
       "counts":counts,"warning":"SYNTHETIC student policy, not Jev, no real-world safety or drone latency"},sort_keys=True))
if __name__=="__main__":main()
