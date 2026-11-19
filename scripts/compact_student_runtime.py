"""Dependency-free bounded local inference for a compact offline student policy.

The output is advisory. Safety-critical actions require an external controller;
not Jev, not a safety certificate, and no actuation here.
"""
from __future__ import annotations
from hashlib import sha256
from math import exp, isfinite
import json
from pathlib import Path

FEATURE_NAMES = ("battery", "obstacle_m", "wind_mps", "link", "sensor")
ACTIONS = ("inspect", "hold", "return")

def validate_observation(observation):
    if not isinstance(observation, dict) or set(observation) != set(FEATURE_NAMES):
        return None
    values = []
    bounds = ((0, 1), (0, 30), (0, 25), (0, 1), (0, 1))
    for name, (lower, upper) in zip(FEATURE_NAMES, bounds):
        value = observation[name]
        if type(value) not in (int, float) or not isfinite(value) or not lower <= value <= upper:
            return None
        values.append(float(value))
    return values

def load_artifact(path):
    raw = json.loads(Path(path).read_text())
    if raw.get("schema") != "intelligence.compact-student.v1" or raw.get("features") != list(FEATURE_NAMES) or raw.get("actions") != list(ACTIONS):
        raise ValueError("unsupported artifact")
    content = dict(raw)
    digest = content.pop("sha256", None)
    canonical = json.dumps(content, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    if digest != sha256(canonical).hexdigest():
        raise ValueError("artifact digest mismatch")
    weights = raw.get("layers")
    dims = [(5, 16), (16, 3)]
    if not isinstance(weights, list) or len(weights) != 2:
        raise ValueError("invalid model")
    for layer, (input_size, output_size) in zip(weights, dims):
        w, b = layer.get("w"), layer.get("b")
        if not isinstance(w, list) or len(w) != output_size or not isinstance(b, list) or len(b) != output_size:
            raise ValueError("invalid weights")
        if any(not isinstance(row, list) or len(row) != input_size for row in w):
            raise ValueError("invalid weight shape")
        if any(type(v) not in (int, float) or not isfinite(v) for row in w for v in row) or any(type(v) not in (int, float) or not isfinite(v) for v in b):
            raise ValueError("non-finite weight")
    return raw

def choose(artifact, observation, minimum_confidence=0.8):
    abstain = {"status": "no_decision", "action": None, "confidence": 0.0}
    values = validate_observation(observation)
    if values is None or not 0 < minimum_confidence <= 1:
        return abstain
    # This sensor-quality cutoff is a hard precondition, not a learned safety proof.
    if observation["sensor"] < 0.35:
        return abstain
    x = [values[0], values[1] / 30, values[2] / 25, values[3], values[4]]
    for index, layer in enumerate(artifact["layers"]):
        x = [sum(w * a for w, a in zip(row, x)) + b for row, b in zip(layer["w"], layer["b"])]
        if index == 0:
            x = [max(0, v) for v in x]
    shift = max(x)
    probs = [exp(v - shift) for v in x]
    total = sum(probs)
    probs = [p / total for p in probs]
    best = max(range(3), key=lambda i: probs[i])
    if probs[best] < minimum_confidence:
        return abstain
    return {"status": "choice", "action": ACTIONS[best], "confidence": probs[best]}
