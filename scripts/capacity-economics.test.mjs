import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCapacityEconomics} from './capacity-economics.mjs';
const base=()=>({
  monthlyAcceptedTasks:1000,tokensPerAttempt:1000,minAcceptanceRate:.8,maxLatencyMs:10000,
  api:{usdPerMillionTokens:3,acceptanceRate:1,latencyMs:1000},
  reserved:{gpuCount:1,usdPerGpuHour:1,billableHours:100,measuredTokensPerSecondPerGpu:100,
    utilization:.5,acceptanceRate:.9,latencyMs:900,operatingUsd:0}
});
test('API wins small workloads',()=>{const r=compareCapacityEconomics(base());assert.equal(r.status,'estimate');assert.equal(r.recommended,'api')});
test('reserved wins large workloads if benchmarked capacity allows',()=>{const i=base();i.monthlyAcceptedTasks=100000;i.reserved.measuredTokensPerSecondPerGpu=10000;const r=compareCapacityEconomics(i);assert.equal(r.recommended,'reserved')});
test('underprovisioned GPU is not recommended even when cheaper',()=>{const i=base();i.monthlyAcceptedTasks=100000;const r=compareCapacityEconomics(i);assert.equal(r.options[1].qualified,false);assert.equal(r.recommended,'api')});
test('reject inadequate quality even when price is lower',()=>{const i=base();i.reserved.acceptanceRate=.5;assert.equal(compareCapacityEconomics(i).options[1].qualified,false)});
test('reject unmeasured latency against binding deadline',()=>{const i=base();delete i.api.latencyMs;assert.equal(compareCapacityEconomics(i).options[0].qualified,false)});
test('abstain if neither option qualifies',()=>{const i=base();i.minAcceptanceRate=.99;i.api.acceptanceRate=.9;assert.equal(compareCapacityEconomics(i).status,'abstain')});
test('reject invalid rates',()=>{const i=base();i.reserved.utilization=1.1;assert.throws(()=>compareCapacityEconomics(i),RangeError)});
test('account for per-task retries in token demand',()=>{const i=base();i.reserved.acceptanceRate=.5;i.minAcceptanceRate=.4;const r=compareCapacityEconomics(i);assert.equal(r.options[1].requiredTokens,2000000)});
