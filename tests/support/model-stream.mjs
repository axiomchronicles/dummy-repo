/** Controlled provider boundary for API/browser streaming tests; never used in production. */
import { createServer } from 'node:http';
let interrupted = 0;
const server = createServer(async (req, res) => {
  if (req.url === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ interrupted }));
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString());
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
  });
  let stopped = false;
  res.on('close', () => {
    stopped = true;
    if (!res.writableEnded) interrupted++;
  });
  const send = (value) => {
    if (!stopped)
      res.write(`data: ${JSON.stringify({ choices: [{ delta: value }] })}\n\n`);
  };
  const lastUser =
    body.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
  const current = body.messages.slice(
    body.messages.findLastIndex((m) => m.role === 'user') + 1,
  );
  const toolMessages = current.filter((m) => m.role === 'tool');
  if (lastUser.includes('stream probe')) {
    send({ content: 'First visible delta. ' });
    await new Promise((r) => setTimeout(r, 350));
    send({ content: 'Generation finished.' });
  } else if (!toolMessages.length) {
    const name =
      lastUser.match(/call\s+(.+?)\s+(?:on|about|to ask|for)\b/i)?.[1] ??
      'Missing recipient';
    send({
      tool_calls: [
        {
          index: 0,
          id: 'resolve-call',
          type: 'function',
          function: {
            name: 'resolve_contact',
            arguments: JSON.stringify({ name }),
          },
        },
      ],
    });
  } else {
    const resolved = JSON.parse(toolMessages[0].content);
    if (resolved.error) send({ content: resolved.error.message });
    else if (toolMessages.length === 1)
      send({
        tool_calls: [
          {
            index: 0,
            id: 'eligibility-call',
            type: 'function',
            function: {
              name: 'get_eligibility',
              arguments: JSON.stringify({
                contactId: resolved.result.contactId,
              }),
            },
          },
        ],
      });
    else if (toolMessages.length === 2)
      send({
        tool_calls: [
          {
            index: 0,
            id: 'configuration-call',
            type: 'function',
            function: { name: 'get_telephony_configuration', arguments: '{}' },
          },
        ],
      });
    else if (toolMessages.length === 3)
      send({
        tool_calls: [
          {
            index: 0,
            id: 'prepare-call',
            type: 'function',
            function: {
              name: 'prepare_call_plan',
              arguments: JSON.stringify({
                contactId: resolved.result.contactId,
              }),
            },
          },
        ],
      });
    else {
      const prepared = JSON.parse(toolMessages.at(-1).content);
      if (prepared.error) send({ content: prepared.error.message });
      else {
        send({
          content: `Prepared ${prepared.result.eligibleCount} eligible recipient. `,
        });
        await new Promise((r) => setTimeout(r, 180));
        send({
          content:
            prepared.result.mode === 'simulation'
              ? 'SIMULATION: no telephone will be dialed.'
              : 'REAL CALL: blocked until all readiness gates pass and you confirm.',
        });
      }
    }
  }
  if (!stopped) res.end('data: [DONE]\n\n');
});
server.listen(3199, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => server.close(() => process.exit(0)));
