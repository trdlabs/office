import {
  OFFICE_API,
  officeEventSchema,
  type AgentActivity,
  type AgentStatusMap,
  type BacktestSummary,
  type BotHealth,
  type Hypothesis,
  type InfraStatus,
  type KnowledgeEntry,
  type OfficeEvent,
  type OfficeGateway,
  type OperatorConfirm,
  type OperatorMessage,
  type OperatorMessageAccepted,
} from '@trading-office/office-gateway';
import type { ConnectionStatus } from './OfficeRuntimeStore';

interface WebSocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: 'message' | 'open' | 'close' | 'error', listener: (ev: { data?: unknown }) => void): void;
  removeEventListener(type: string, listener: (ev: unknown) => void): void;
}

export interface HttpOfficeGatewayOptions {
  baseUrl: string;
  wsUrl?: string;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  wsFactory?: (url: string) => WebSocketLike;
  /** Supplies the current operator session token, read at request time. */
  getToken?: () => string | null;
}

const MAX_RECONNECT_ATTEMPTS = 6;

export class HttpOfficeGateway implements OfficeGateway {
  private readonly baseUrl: string;
  private readonly wsUrl: string;
  private readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  private readonly wsFactory: (url: string) => WebSocketLike;
  private readonly getToken: () => string | null;

  private ws: WebSocketLike | null = null;
  private readonly subscribers = new Set<(e: OfficeEvent) => void>();
  private attempts = 0;
  private closedByUs = false;
  private connectionStatus: ConnectionStatus = 'connected';
  private readonly connectionSubs = new Set<(s: ConnectionStatus) => void>();

  subscribeConnection(cb: (s: ConnectionStatus) => void): () => void {
    this.connectionSubs.add(cb);
    cb(this.connectionStatus);
    return () => { this.connectionSubs.delete(cb); };
  }

  private setConnection(s: ConnectionStatus): void {
    if (this.connectionStatus === s) return;
    this.connectionStatus = s;
    for (const cb of this.connectionSubs) cb(s);
  }

  constructor(opts: HttpOfficeGatewayOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.wsUrl = (opts.wsUrl ?? this.baseUrl.replace(/^http/, 'ws')).replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.wsFactory = opts.wsFactory ?? ((url) => new WebSocket(url) as unknown as WebSocketLike);
    this.getToken = opts.getToken ?? (() => null);
  }

  /** Authorization header for the current token, or {} when running open. */
  private authHeaders(): Record<string, string> {
    const token = this.getToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(this.baseUrl + path, { headers: this.authHeaders() });
    if (!res.ok) {
      let detail = res.statusText;
      try { const body = (await res.json()) as { error?: { message?: string } }; detail = body?.error?.message ?? detail; } catch { /* keep statusText */ }
      this.setConnection('error');
      throw new Error(`office GET ${path} failed: ${res.status} ${detail}`); // surfaced — NO silent fallback
    }
    if (!this.ws) this.setConnection('connected');
    return (await res.json()) as T;
  }

  getAgentStatuses() { return this.get<AgentStatusMap>(OFFICE_API.agentStatuses); }
  getAgentActivity(agentId: string) { return this.get<AgentActivity>(OFFICE_API.agentActivity(agentId)); }
  getHypotheses() { return this.get<Hypothesis[]>(OFFICE_API.hypotheses); }
  getBacktests() { return this.get<BacktestSummary[]>(OFFICE_API.backtests); }
  getBotHealth() { return this.get<BotHealth[]>(OFFICE_API.bots); }
  getKnowledge() { return this.get<KnowledgeEntry[]>(OFFICE_API.knowledge); }
  getInfraStatus() { return this.get<InfraStatus>(OFFICE_API.infra); }

  async sendOperatorMessage(msg: OperatorMessage): Promise<OperatorMessageAccepted> {
    const res = await this.fetchImpl(this.baseUrl + OFFICE_API.operatorMessages, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify(msg),
    });
    if (!res.ok) throw new Error(`operator message rejected: ${res.status}`);
    return (await res.json()) as OperatorMessageAccepted;
  }

  async confirmAction(input: OperatorConfirm): Promise<OperatorMessageAccepted> {
    const res = await this.fetchImpl(this.baseUrl + OFFICE_API.operatorConfirm, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`operator confirm rejected: ${res.status}`);
    return (await res.json()) as OperatorMessageAccepted;
  }

  subscribeOfficeEvents(cb: (e: OfficeEvent) => void): () => void {
    this.subscribers.add(cb);
    if (!this.ws) this.connect();
    return () => {
      this.subscribers.delete(cb);
      if (this.subscribers.size === 0) this.disconnect();
    };
  }

  private connect(): void {
    this.setConnection('connecting');
    this.closedByUs = false;
    // The browser WebSocket cannot set headers, so the session token rides in
    // the query string; the server reads it from ?access_token on the upgrade.
    const token = this.getToken();
    const wsUrl = this.wsUrl + OFFICE_API.events + (token ? `?access_token=${encodeURIComponent(token)}` : '');
    const ws = this.wsFactory(wsUrl);
    this.ws = ws;
    ws.addEventListener('open', () => { this.attempts = 0; this.setConnection('connected'); });
    ws.addEventListener('message', (ev) => {
      const raw = typeof ev.data === 'string' ? safeJson(ev.data) : ev.data;
      const parsed = officeEventSchema.safeParse(raw);
      if (parsed.success) for (const fn of this.subscribers) fn(parsed.data);
    });
    ws.addEventListener('close', () => {
      if (this.closedByUs || this.subscribers.size === 0) {
        this.ws = null;
        return;
      }
      this.ws = null;
      this.setConnection(this.attempts >= MAX_RECONNECT_ATTEMPTS ? 'disconnected' : 'reconnecting');
      this.scheduleReconnect();
    });
    ws.addEventListener('error', () => { /* do not swallow in the UI: a close + reconnect follows */ });
  }

  private scheduleReconnect(): void {
    if (this.closedByUs || this.subscribers.size === 0) return;
    if (this.attempts >= MAX_RECONNECT_ATTEMPTS) return; // bounded — no infinite loop, no offline queue
    this.attempts += 1;
    const delay = Math.min(8000, 300 * 2 ** (this.attempts - 1));
    setTimeout(() => { if (!this.ws && this.subscribers.size > 0) this.connect(); }, delay);
  }

  private disconnect(): void {
    this.closedByUs = true;
    this.ws?.close();
    this.ws = null;
  }
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
