import { describe, it, expect } from 'vitest';
import { readSse } from './sse';
const encode = new TextEncoder();
describe('incremental SSE', () => {
  it('preserves UTF-8, CRLF, multiline data and final unterminated buffers at every byte boundary', async () => {
    const bytes = encode.encode(
      ': heartbeat\r\nevent: delta\r\ndata: héllo\r\ndata: 世界\r\n\r\nevent: done\ndata: final',
    );
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const byte of bytes) c.enqueue(Uint8Array.of(byte));
        c.close();
      },
    });
    const result = [];
    for await (const event of readSse(stream)) result.push(event);
    expect(result).toEqual([
      { event: 'delta', data: 'héllo\n世界' },
      { event: 'done', data: 'final' },
    ]);
  });
  it('yields the first delta before generation ends and cancels the producer on abort', async () => {
    let finished = false;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encode.encode('event: delta\ndata: first\n\n'));
        timer = setTimeout(() => {
          finished = true;
          c.enqueue(encode.encode('event: done\ndata: final\n\n'));
          c.close();
        }, 250);
      },
      cancel() {
        cancelled = true;
        clearTimeout(timer);
      },
    });
    const abort = new AbortController();
    const events = readSse(stream, abort.signal);
    expect((await events.next()).value).toEqual({
      event: 'delta',
      data: 'first',
    });
    expect(finished).toBe(false);
    abort.abort();
    await expect(events.next()).rejects.toThrow();
    expect(cancelled).toBe(true);
    expect(finished).toBe(false);
  });
});
