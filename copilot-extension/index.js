import express from 'express';
import { SYSTEM_PROMPT } from './prompts.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ship-copilot-extension' }));

app.post('/', async (req, res) => {
  const token = req.headers['x-github-token'];

  if (!token) {
    return res.status(401).json({ error: 'Missing X-GitHub-Token header' });
  }

  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Request body must include a messages array' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

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
