/** Incremental SSE decoding for POST streams. Network chunks are not event boundaries. */
export type ServerEvent = { event: string; data: string; id?: string };
export async function* readSse(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<ServerEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = 'message';
  let data: string[] = [];
  let id: string | undefined;
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', abort, { once: true });
  function line(value: string): ServerEvent | undefined {
    if (value === '') {
      const result = data.length
        ? { event, data: data.join('\n'), ...(id ? { id } : {}) }
        : undefined;
      event = 'message';
      data = [];
      return result;
    }
    if (value.startsWith(':')) return;
    const index = value.indexOf(':');
    const field = index < 0 ? value : value.slice(0, index);
    const raw = index < 0 ? '' : value.slice(index + 1);
    const content = raw.startsWith(' ') ? raw.slice(1) : raw;
    if (field === 'event') event = content;
    if (field === 'data') data.push(content);
    if (field === 'id' && !content.includes('\0')) id = content;
  }
  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r\n|\r|\n/.exec(buffer))) {
        if (!done && match[0] === '\r' && match.index === buffer.length - 1)
          break;
        const result = line(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
        if (result) yield result;
      }
      if (done) {
        if (buffer) line(buffer);
        const last = line('');
        if (last) yield last;
        break;
      }
    }
    signal?.throwIfAborted();
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
