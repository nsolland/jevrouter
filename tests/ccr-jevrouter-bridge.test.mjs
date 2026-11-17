import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridge, mapDecision, validateRequest } from '../integrations/ccr/ccr-jevrouter-bridge.mjs';
const body = { state: { task: 'Fix a simple typo' }, questions: { route: { type: 'choice', criteria: { fast: 'Easy work', reasoning: 'Hard work', unchanged: 'Abstain' } } } };

test('rejects malformed and untrusted requests', () => {
  assert.throws(() => validateRequest({ ...body, state: { task: '' } }));
  assert.throws(() => validateRequest({ ...body, questions: { route: { type: 'choice', criteria: { fast: 'x' } } } } }));
  assert.throws(() => createBridge({ decide: () => {}, host: '0.0.0.0' }));
});
test('maps choice and abstains on denied or malformed decisions', () => {
  const candidate = (id, confidence, router = { filtered: false, requires_confirmation: false, allowed: true }) =>
    ({ id, jev_confidence: confidence, router });
  assert.deepEqual(mapDecision({ status: 'selected', decision: { selected: 'fast', candidates: [candidate('fast', 0.9)] } }), { answers: { route: { type: 'choice', choice: 'fast', confidence: 0.9 } } });
  assert.equal(mapDecision({ status: 'selected', decision: { selected: 'untrusted', candidates: [] } }), null);
  assert.equal(mapDecision({ status: 'selected', decision: { selected: 'fast', candidates: [candidate('fast', NaN)] } }), null);
  assert.equal(mapDecision({ status: 'needs_confirmation', decision: { selected: 'fast', candidates: [candidate('fast', 0.9)] } }), null);
  assert.equal(mapDecision({ status: 'selected', decision: { selected: 'fast', candidates: [candidate('fast', 0.9, { allowed: false })] } }), null);
});
test('local HTTP bridge has auth, bounds and compatible response', async (t) => {
  const server = createBridge({ token: 'test-token', decide: async () => ({ status: 'selected', decision: { selected: 'reasoning', candidates: [{ id: 'reasoning', jev_confidence: 0.83, router: { allowed: true, filtered: false, requires_confirmation: false } }] } }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/v1/systemone`;
  const post = (payload, headers = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) });
  assert.equal((await post(body)).status, 401);
  const r = await post(body, { authorization: 'Bearer test-token' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { answers: { route: { type: 'choice', choice: 'reasoning', confidence: 0.83 } } });
  assert.equal((await post({ ...body, state: { task: 'a'.repeat(8193) } }, { authorization: 'Bearer test-token' })).status, 422);
});
