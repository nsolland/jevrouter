// CCR Node.js script rule body (not an ES module). Optional, disabled by default.
// Requires the local JevRouter bridge, not direct provider credentials.
if (api.env('CCR_JEV_ROUTING_ENABLED') !== '1' || input.model !== 'auto') return null;
if (input.summary.hasImage || !input.summary.lastUserText?.trim()) return null;
const fast = api.env('CCR_JEV_FAST_MODEL');
const reasoning = api.env('CCR_JEV_REASONING_MODEL');
const token = api.env('CCR_JEV_BRIDGE_TOKEN');
if (!fast || !reasoning || !token || token.length < 20) return null;
const threshold = Number(api.env('CCR_JEV_MIN_CONFIDENCE') || '0.75');
if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) return null;
const targets = { fast, reasoning };
try {
  const response = await api.fetch('http://127.0.0.1:3460/v1/systemone', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      state: { task: input.summary.lastUserText.slice(0, 8192), inputTokens: input.tokenCount, toolCount: input.summary.toolNames.length },
      questions: { route: {
        type: 'choice',
        criteria: {
          fast: 'Straightforward edits, extraction, summaries, or factual lookups with few dependent steps.',
          reasoning: 'Complex debugging, architecture, multi-file reasoning, or tasks with substantial ambiguity.',
          unchanged: 'Insufficient information or unsafe to classify.'
        }
      } }
    })
  });
  if (!response.ok) return null;
  const answer = JSON.parse(response.body)?.answers?.route;
  if (answer?.type !== 'choice' || !Number.isFinite(answer.confidence) ||
      answer.confidence < threshold || answer.confidence > 1 ||
      !Object.hasOwn(targets, answer.choice)) return null;
  return { model: targets[answer.choice] };
} catch { return null; }
