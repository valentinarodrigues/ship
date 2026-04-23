import express from 'express';
import { SYSTEM_PROMPT } from './prompts.js';

const app = express();
app.use(express.json());

const MOCK_MODE = process.env.MOCK_MODE === 'true';

function sseChunk(content) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

function mockResponse(messages, res) {
  const userMsg = messages.findLast(m => m.role === 'user')?.content ?? '';
  let reply;

  if (/commit/i.test(userMsg)) {
    reply = 'Here\'s a conventional commit:\n\n```\nfeat(auth): add OAuth2 login support\n```\n\nUsed `feat` because it\'s a new capability, scoped to `auth`.';
  } else if (/valid|validate|check/i.test(userMsg)) {
    reply = '✓ Valid — follows `type(scope): description` format with imperative mood.';
  } else if (/changelog/i.test(userMsg)) {
    reply = '## [v1.2.0] — 2026-04-23\n\n### Features\n- `abc1234` feat(api): add rate limiting\n\n### Bug Fixes\n- `def5678` fix(auth): handle token expiry edge case';
  } else if (/branch/i.test(userMsg)) {
    reply = '```\nfeat/oauth2-login\n```\n\nAlternatives:\n- `feat/add-oauth-support`\n- `feat/github-oauth`';
  } else {
    reply = 'I\'m SHIP. I can help you **generate commit messages**, **validate PR titles**, **generate changelogs**, or **suggest branch names**. What do you need?';
  }

  for (const word of reply.split(' ')) {
    res.write(sseChunk(word + ' '));
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'ship-copilot-extension', mock: MOCK_MODE })
);

app.post('/', async (req, res) => {
  const token = req.headers['x-github-token'];

  if (!token && !MOCK_MODE) {
    return res.status(401).json({ error: 'Missing X-GitHub-Token header' });
  }

  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Request body must include a messages array' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (MOCK_MODE) {
    console.log('[mock] user:', messages.findLast(m => m.role === 'user')?.content);
    return mockResponse(messages, res);
  }

  let upstream;
  try {
    upstream = await fetch('https://api.githubcopilot.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        stream: true,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      }),
    });
  } catch (err) {
    console.error('Copilot API unreachable:', err.message);
    res.write(`data: ${JSON.stringify({ error: 'Copilot API unreachable' })}\n\n`);
    return res.end();
  }

  if (!upstream.ok) {
    const body = await upstream.text();
    console.error(`Copilot API error ${upstream.status}:`, body);
    res.write(`data: ${JSON.stringify({ error: `Upstream error: ${upstream.status}` })}\n\n`);
    return res.end();
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  } catch (err) {
    console.error('Stream error:', err.message);
  } finally {
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SHIP Copilot Extension listening on :${PORT}`);
});
