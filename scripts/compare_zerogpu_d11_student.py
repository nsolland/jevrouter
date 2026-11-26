#!/usr/bin/env python3
"""Bounded ZeroGPU d1.1 vs offline synthetic student comparison.

No secret-store access. Supply ZGPU_API_KEY via a permitted runtime environment.
No retries, tool calls, actuation, or real-world data. Dry-run means zero network.
"""
import argparse
import json
import os
from pathlib import Path
import random
import statistics
import sys
import time
import urllib.error
import urllib.request
from compact_student_runtime import choose, load_artifact

OPTIONS = {
    "inspect": "Continue inspecting only if visibility, battery, link, obstacles and wind permit.",
    "hold": "Pause or wait when the environment obstructs safe inspection.",
    "return": "Return when battery or link is weak.",
    "no_decision": "Abstain when sensor quality is insufficient or evidence is ambiguous."
}
URL = "https://api.zerogpu.ai/v1/systemone"
def oracle(state):
    if state["sensor"] < .35: return "no_decision"
    if state["battery"] < .2 or state["link"] < .2: return "return"
    if state["obstacle_m"] < 3 or state["wind_mps"] > 18: return "hold"
    return "inspect"

def cases():
    base = dict(battery=.8, obstacle_m=12., wind_mps=3., link=.8, sensor=.95)
    changes = (
        {}, {"battery":.1}, {"link":.1}, {"obstacle_m":1.},
        {"wind_mps":22.}, {"sensor":.1},
        {"battery":.19,"obstacle_m":1.}, {"link":.15,"wind_mps":24.},
        {"battery":.21}, {"obstacle_m":3.1}, {"wind_mps":17.8},
        {"sensor":.36}
    )
    return [dict(base,**mod) for mod in changes]

def parse_answer(data):
    answer = data.get("answers",{}).get("mission_choice",{})
    choice = answer.get("choice")
    probs = answer.get("probabilities",{})
    confidence = answer.get("confidence")
    if answer.get("type") != "choice" or choice not in OPTIONS or (
        not isinstance(probs, dict) or set(probs) != set(OPTIONS) or
        any(type(v) not in (int,float) or not 0<=v<=1 for v in probs.values()) or
        abs(sum(probs.values())-1)>0.001 or
        type(confidence) not in (int,float) or not 0<=confidence<=1
    ): raise ValueError("invalid typed Choice response")
    return choice, confidence

def request_d11(state,key,timeout):
    payload = {"model":"d1.1","state":state,"questions":{"mission_choice":{
        "type":"choice",
        "instructions":"Choose one candidate based only on the supplied synthetic observation. If sensor quality is insufficient, abstain.",
        "criteria":OPTIONS
    }}}
    req = urllib.request.Request(URL, method="POST",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization":"Bearer "+key,"Content-Type":"application/json",
                 "Accept":"application/json"})
    started=time.perf_counter_ns()
    try:
        with urllib.request.urlopen(req,timeout=timeout) as response:
            if response.status != 200: raise RuntimeError("unexpected HTTP status")
            result=json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError("ZEROGPU_HTTP_%s" % error.code) from None
    except urllib.error.URLError:
        raise RuntimeError("ZEROGPU_NETWORK_ERROR") from None
    return (*parse_answer(result),round((time.perf_counter_ns()-started)/1e6,3))

def evaluate(artifact,key=None,limit=12,timeout=12,transport=request_d11):
    results=[]
    for state in cases()[:limit]:
        local=choose(artifact,state)
        actual=oracle(state)
        item={"label":actual,"student":local["action"] or "no_decision"}
        if key is not None:
            try:
                decision,confidence,latency=transport(state,key,timeout)
                item.update(d11=decision,d11_confidence=confidence,d11_latency_ms=latency)
            except Exception as error:
                # Never print provider body, headers, credentials or request.
                category = str(error) if str(error).startswith("ZEROGPU_") else "ZEROGPU_INVALID_RESPONSE"
                item["error"]=category
                results.append(item)
                break  # bounded fail-fast: do not repeatedly charge/retry
        results.append(item)
    completed=[x for x in results if "d11" in x]
    summary={
      "kind":"synthetic_choice_comparison","live":key is not None,
      "requested":limit,"completed":len(completed),"cases":results,
      "student_matches_toy_teacher":sum(x["student"]==x["label"] for x in results),
      "d11_matches_toy_teacher":sum(x["d11"]==x["label"] for x in completed) if key else None,
      "d11_agrees_with_student":sum(x["d11"]==x["student"] for x in completed) if key else None,
      "remote_latency_ms":[x["d11_latency_ms"] for x in completed],
      "notes":"Synthetic examples only; no drone safety, calibration or production latency claim."
    }
    return summary

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--artifact",default=str(Path(__file__).resolve().parents[1] /
       "examples/intelligence/synthetic-student-v1.json"))
    parser.add_argument("--limit",type=int,default=12)
    parser.add_argument("--timeout",type=float,default=12)
    parser.add_argument("--live",action="store_true")
    args=parser.parse_args()
    if not 1<=args.limit<=12 or not 1<=args.timeout<=30: raise SystemExit("invalid bounds")
    model=load_artifact(args.artifact)
    if args.live:
        key=os.environ.get("ZGPU_API_KEY") or os.environ.get("ZEROGPU_API_KEY")
        if not key:
            print(json.dumps({"status":"blocked","reason":"ZGPU_API_KEY environment variable missing",
                              "live":False,"api_calls":0}))
            raise SystemExit(3)
    else: key=None
    out=evaluate(model,key,args.limit,args.timeout)
    out["mode"]="live_d11" if args.live else "local_only_no_network"
    print(json.dumps(out,sort_keys=True))
    if args.live and out["completed"]<args.limit:raise SystemExit(2)

if __name__=="__main__":main()
