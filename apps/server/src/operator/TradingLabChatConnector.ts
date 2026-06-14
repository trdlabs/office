import type { LabChatResponse } from '../connector/tradinglab/labDtos';

export interface ChatUpstreamError extends Error {
  office: { code: 'upstream_unavailable' | 'upstream_unauthorized' | 'upstream_bad_request'; message: string };
}
const makeErr = (code: ChatUpstreamError['office']['code'], message: string): ChatUpstreamError =>
  Object.assign(new Error(message), { office: { code, message } }) as ChatUpstreamError;

export interface ChatConnectorDeps {
  chatUrl: string;
  chatToken: string;
  requestTimeoutMs: number;
  fetchImpl?: typeof fetch;
}
export interface ChatSendInput {
  message: string;
  sessionId: string;
  channel?: 'web' | 'telegram';
}

export class TradingLabChatConnector {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly deps: ChatConnectorDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  async send(input: ChatSendInput): Promise<LabChatResponse> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.deps.requestTimeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.deps.chatUrl}/chat/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.deps.chatToken}` },
        body: JSON.stringify({ message: input.message, sessionId: input.sessionId, channel: input.channel ?? 'web' }),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw makeErr('upstream_unavailable', `chat ingress request failed: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) throw makeErr('upstream_unauthorized', `chat ingress returned ${res.status}`);
    if (res.status === 503) throw makeErr('upstream_unavailable', 'chat ingress not configured');
    if (res.status >= 500) throw makeErr('upstream_unavailable', `chat ingress returned ${res.status}`);
    if (res.status >= 400) throw makeErr('upstream_bad_request', `chat ingress returned ${res.status}`);
    return (await res.json()) as LabChatResponse;
  }
}
