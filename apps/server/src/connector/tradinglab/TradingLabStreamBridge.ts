import type { OfficeEvent, AgentStatusMap } from '@trading-office/office-gateway';
import type { LabAgentEvent, LabAgentId, LabLifecycle } from './labDtos';
import { createSseParser, type SseFrame } from './sseParse';
import { mapAgentId, mapAgentStatus } from './mappers';

export interface SseConnection {
  frames: AsyncIterable<SseFrame>;
  close(): void;
}
export interface SseConnectOpts {
  url: string;
  headers: Record<string, string>;
  signal: AbortSignal;
}
export type SseConnect = (opts: SseConnectOpts) => Promise<SseConnection>;

export type StreamState = 'live' | 'degraded' | 'error';

export interface StreamBridgeDeps {
  url: string;
  readToken: string;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
  onSnapshot: () => Promise<AgentStatusMap>;
  connect?: SseConnect;
  now?: () => string;
  sleep?: (ms: number) => Promise<void>;
}

const safeJson = (s: string): unknown => { try { return JSON.parse(s); } catch { return null; } };

const defaultSseConnect: SseConnect = async ({ url, headers, signal }) => {
  const res = await fetch(url, { headers, signal });
  if (!res.ok || !res.body) throw new Error(`stream connect failed: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  async function* gen(): AsyncGenerator<SseFrame> {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      for (const f of parser.push(decoder.decode(value, { stream: true }))) yield f;
    }
  }
  return { frames: gen(), close: () => { void reader.cancel(); } };
};

export class TradingLabStreamBridge {
  private stopped = false;
  private ctrl: AbortController | null = null;
  private lastEventId: string | undefined;
  private _state: StreamState = 'error';
  private noticed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly subs = new Set<(e: LabAgentEvent) => void>();
  private readonly now: () => string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly connect: SseConnect;

  constructor(private readonly deps: StreamBridgeDeps) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => { this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; r(); }, ms); }));
    this.connect = deps.connect ?? defaultSseConnect;
  }

  state(): StreamState { return this._state; }

  subscribeAppended(cb: (e: LabAgentEvent) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  start(emit: (e: OfficeEvent) => void): () => void {
    this.stopped = false;
    void this.loop(emit);
    return () => {
      this.stopped = true;
      this.ctrl?.abort();
      if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    };
  }

  private async loop(emit: (e: OfficeEvent) => void): Promise<void> {
    let backoff = this.deps.reconnectBaseMs;
    let firstConnect = true;
    while (!this.stopped) {
      this.ctrl = new AbortController();
      try {
        const conn = await this.connect({
          url: `${this.deps.url}/v1/stream`,
          headers: {
            Authorization: `Bearer ${this.deps.readToken}`,
            accept: 'text/event-stream',
            ...(this.lastEventId ? { 'Last-Event-ID': this.lastEventId } : {}),
          },
          signal: this.ctrl.signal,
        });
        this._state = 'live';
        this.noticed = false;
        backoff = this.deps.reconnectBaseMs;
        if (!firstConnect) {
          emit({ type: 'agent_statuses_snapshot', ts: this.now(), statuses: await this.deps.onSnapshot() });
        }
        firstConnect = false;
        for await (const frame of conn.frames) {
          if (this.stopped) break;
          this.handleFrame(frame, emit);
        }
        conn.close();
      } catch {
        /* fall through to degrade + backoff */
      }
      if (this.stopped) break;
      this._state = this._state === 'live' ? 'degraded' : 'error';
      if (!this.noticed) {
        this.noticed = true;
        emit({ type: 'system_notice', ts: this.now(), level: 'warn', text: 'live stream degraded — reconnecting' });
      }
      await this.sleep(backoff);
      backoff = Math.min(backoff * 2, this.deps.reconnectMaxMs);
    }
  }

  private handleFrame(frame: SseFrame, emit: (e: OfficeEvent) => void): void {
    if (frame.event === 'agent_status_changed') {
      const d = safeJson(frame.data) as { agentId?: LabAgentId; status?: LabLifecycle } | null;
      if (!d?.agentId || !d.status) return;
      emit({ type: 'agent_status_changed', ts: this.now(), agentId: mapAgentId(d.agentId), status: mapAgentStatus(d.agentId, d.status) });
    } else if (frame.event === 'agent_event_appended') {
      if (frame.id) this.lastEventId = frame.id;
      const d = safeJson(frame.data) as { agentId?: LabAgentId; event?: LabAgentEvent } | null;
      if (!d?.agentId || !d.event) return;
      emit({ type: 'agent_trace_appended', ts: this.now(), agentId: mapAgentId(d.agentId), line: { ts: d.event.ts, level: d.event.level, text: d.event.summary } });
      for (const sub of this.subs) sub(d.event);
    }
  }
}
