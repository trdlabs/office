import { describe, it, expect } from 'vitest';
import { createSseParser } from './sseParse';

describe('createSseParser', () => {
  it('parses a complete frame', () => {
    const p = createSseParser();
    expect(p.push('event: agent_status_changed\ndata: {"a":1}\n\n')).toEqual([
      { event: 'agent_status_changed', data: '{"a":1}', id: undefined },
    ]);
  });
  it('reassembles a frame split across chunks', () => {
    const p = createSseParser();
    expect(p.push('event: x\nda')).toEqual([]);
    expect(p.push('ta: hi\n\n')).toEqual([{ event: 'x', data: 'hi', id: undefined }]);
  });
  it('ignores comment heartbeats and captures id', () => {
    const p = createSseParser();
    expect(p.push(': ping\n\n')).toEqual([]);
    expect(p.push('id: c1\nevent: agent_event_appended\ndata: {}\n\n')).toEqual([
      { event: 'agent_event_appended', data: '{}', id: 'c1' },
    ]);
  });
  it('joins multiple data lines with newline and tolerates CRLF', () => {
    const p = createSseParser();
    expect(p.push('data: a\r\ndata: b\r\n\r\n')).toEqual([{ event: undefined, data: 'a\nb', id: undefined }]);
  });
});
