/** Optional loopback-only CCR -> JevRouter decision bridge. Never executes model requests. */
import { createServer } from 'node:http';

export const MAX_BYTES = 32 * 1024;
export const CHOICES = Object.freeze(['fast', 'reasoning', 'unchanged']);

export function validateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_body');
  const question = body.questions?.route;
  if (question?.type !== 'choice' || !question.criteria ||
      CHOICES.some(c => typeof question.criteria[c] !== 'string') ||
      Object.keys(question.criteria).sort().join(',') !== [...CHOICES].sort().join(',')) {
    throw new Error('invalid_criteria');
  }
  if (typeof body.state?.task !== 'string' || !body.state.task.trim() || body.state.task.length > 8192) {
    throw new Error('invalid_task');
  }
  return { task: body.state.task, criteria: question.criteria };
}

export function mapDecision(result) {
  const selected = result?.decision?.selected;
  const candidate = result?.decision?.candidates?.find(c => c.id === selected);
  const confidence = candidate?.jev_confidence;
  if (!CHOICES.includes(selected) || !Number.isFinite(confidence) || confidence < 0 || confidence > 1 ||
      result?.status !== 'selected' || candidate?.router?.filtered || candidate?.router?.requires_confirmation ||
      candidate?.router?.allowed !== true) return null;
  return { answers: { route: { type: 'choice', choice: selected, confidence } } };
}

export function createBridge({ decide, token, host = '127.0.0.1' }) {
  if (typeof decide !== 'function') throw new TypeError('decide function required');
  if (host !== '127.0.0.1' && host !== '::1') throw new Error('loopback_only');
  return createServer(async (req, res) => {
    const respond = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.url !== '/v1/systemone' || req.method !== 'POST') return respond(404, { error: 'not_found' });
    if (token && req.headers.authorization !== `Bearer ${token}`) return respond(401, { error: 'unauthorized' });
    if (!req.headers['content-type']?.startsWith('application/json')) return respond(415, { error: 'content_type' });
    let size = 0;
    const chunks = [];
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BYTES) return respond(413, { error: 'too_large' });
        chunks.push(chunk);
      }
      const { task, criteria } = validateRequest(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      const result = await decide({ request: task, candidates: CHOICES.map(id => ({ name: id, description: criteria[id] })) });
      const mapped = mapDecision(result);
      return mapped ? respond(200, mapped) : respond(422, { error: 'no_decision' });
    } catch {
      return respond(422, { error: 'invalid_or_unavailable' });
    }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { route } = await import('../../dist/index.js');
  const token = process.env.CCR_JEV_BRIDGE_TOKEN;
  const port = Number(process.env.CCR_JEV_BRIDGE_PORT || '3460');
  if (!token || token.length < 20 || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('CCR_JEV_BRIDGE_TOKEN (20+ chars) and valid port required');
  }
  const provider = process.env.CCR_JEV_PROVIDER || 'typesafe';
  if (!['typesafe', 'openrouter', 'zuse', 'open-spark-jev'].includes(provider)) throw new Error('invalid_provider');
  const server = createBridge({ token, decide: input => route(input, { provider }) });
  server.listen(port, '127.0.0.1', () => console.log(`CCR JevRouter bridge listening on 127.0.0.1:${port}`));
}
