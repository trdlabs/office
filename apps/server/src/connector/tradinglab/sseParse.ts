export interface SseFrame {
  event?: string;
  data: string;
  id?: string;
}

interface Pending {
  event?: string;
  data: string[];
  id?: string;
}

export function createSseParser(): { push(chunk: string): SseFrame[] } {
  let buf = '';
  let cur: Pending = { data: [] };

  const dispatch = (sink: SseFrame[]): void => {
    const hasContent = cur.event !== undefined || cur.id !== undefined || cur.data.length > 0;
    if (!hasContent) return;
    sink.push({ event: cur.event, data: cur.data.join('\n'), id: cur.id });
    cur = { data: [] };
  };

  const handleLine = (line: string, sink: SseFrame[]): void => {
    if (line === '') { dispatch(sink); return; }
    if (line.startsWith(':')) return; // comment / heartbeat
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? '' : line.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') cur.event = value;
    else if (field === 'data') cur.data.push(value);
    else if (field === 'id') cur.id = value;
  };

  return {
    push(chunk: string): SseFrame[] {
      const frames: SseFrame[] = [];
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        let line = buf.slice(0, nl);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        buf = buf.slice(nl + 1);
        handleLine(line, frames);
      }
      return frames;
    },
  };
}
