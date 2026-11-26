import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const body = await readFile(new URL('../integrations/ccr/ccr-routing-rule.js', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const rule = new AsyncFunction('input', 'api', body);
const request = { model: 'auto', summary: { hasImage: false, lastUserText: 'Fix a typo', toolNames: [] }, tokenCount: 15 };
const values = { CCR_JEV_ROUTING_ENABLED: '1', CCR_JEV_FAST_MODEL: 'local/fast', CCR_JEV_REASONING_MODEL: 'local/reasoning', CCR_JEV_BRIDGE_TOKEN: 'test-bridge-token-strong' };

test('CCR rule chooses only a mapped sufficiently confident option', async () => {
  let seen;
  const api = {
    env: key => values[key],
    fetch: async (url, opts) => {
      seen = { url, opts };
      return { ok: true, body: JSON.stringify({ answers: { route: { type: 'choice', choice: 'reasoning', confidence: 0.9 } } }) };
    },
  };
  assert.deepEqual(await rule(request, api), { model: 'local/reasoning' });
  assert.equal(seen.url, 'http://127.0.0.1:3460/v1/systemone');
  assert.equal(seen.opts.headers.authorization, 'Bearer test-bridge-token-strong');
  assert.equal(JSON.parse(seen.opts.body).state.task, 'Fix a typo');
});
test('CCR rule passes through disabled, explicit, image, low-confidence and failures', async () => {
  let calls = 0;
  const api = { env: key => values[key], fetch: async () => {
    calls++;
    return { ok: true, body: JSON.stringify({ answers: { route: { type: 'choice', choice: 'fast', confidence: 0.2 } } }) };
  } };
  assert.equal(await rule({ ...request, model: 'explicit/model' }, api), null);
  assert.equal(await rule({ ...request, summary: { ...request.summary, hasImage: true } }, api), null);
  assert.equal(calls, 0);
  assert.equal(await rule(request, api), null);
  assert.equal(calls, 1);
  assert.equal(await rule(request, { ...api, env: key => key === 'CCR_JEV_ROUTING_ENABLED' ? '0' : values[key] }), null);
  assert.equal(await rule(request, { ...api, fetch: async () => { throw new Error('offline'); } }), null);
});
