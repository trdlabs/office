import type { OfficeEvent, OperatorMessage, OperatorMessageAccepted, OperatorReply } from '@trading-office/office-gateway';
import type { OfficeEventBus } from '../events/OfficeEventBus';
import type { ChatFollowConfig } from '../config';
import type { LabChatResponse } from '../connector/tradinglab/labDtos';
import type { TradingLabChatConnector } from './TradingLabChatConnector';
import type { TradingLabHttpClient } from '../connector/tradinglab/TradingLabHttpClient';
import type { TradingLabStreamBridge } from '../connector/tradinglab/TradingLabStreamBridge';
import { assertNoExecutionAuthority } from '../guard/noExecutionAuthority';
import { ConversationFollower, type FollowerIds } from './ConversationFollower';

export type OperatorResponder = (msg: OperatorMessage, bus: OfficeEventBus) => OperatorMessageAccepted;

export function defaultNewIds(): () => FollowerIds {
  let c = 0;
  return () => { c += 1; return { operatorMessageId: `m${c}`, conversationId: `c${c}`, replyMessageId: `r${c}` }; };
}

export interface StartFollowArgs { ids: FollowerIds; taskId: string; taskType?: string; nextTaskType?: string; emit: (e: OfficeEvent) => void }

export interface TradingLabOperatorResponderDeps {
  chat: Pick<TradingLabChatConnector, 'send'>;
  client: Pick<TradingLabHttpClient, 'getAgentEvents'>;
  bridge: Pick<TradingLabStreamBridge, 'subscribeAppended'>;
  guards: ChatFollowConfig;
  now?: () => string;
  newIds?: () => FollowerIds;
  startFollow?: (args: StartFollowArgs) => void;
}

export function makeTradingLabOperatorResponder(deps: TradingLabOperatorResponderDeps): OperatorResponder {
  const now = deps.now ?? (() => new Date().toISOString());
  const newIds = deps.newIds ?? defaultNewIds();
  const startFollow = deps.startFollow ?? ((args: StartFollowArgs) => {
    void new ConversationFollower({
      ids: args.ids, taskId: args.taskId, taskType: args.taskType, nextTaskType: args.nextTaskType, emit: args.emit,
      client: deps.client, bridge: deps.bridge, guards: deps.guards,
    }).run();
  });

  return (msg, bus) => {
    assertNoExecutionAuthority(msg);
    const ids = newIds();
    const emit = (e: OfficeEvent): void => bus.publish(e);
    emit({ type: 'operator_message_accepted', ts: now(), operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId });
    void runTurn(msg, ids, emit, deps, now, startFollow);
    return { operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId, status: 'accepted' };
  };
}

async function runTurn(
  msg: OperatorMessage,
  ids: FollowerIds,
  emit: (e: OfficeEvent) => void,
  deps: TradingLabOperatorResponderDeps,
  now: () => string,
  startFollow: (args: StartFollowArgs) => void,
): Promise<void> {
  const progress = (stage: string, note: string): void =>
    emit({ type: 'operator_message_progress', ts: now(), operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId, replyMessageId: ids.replyMessageId, stage, note });
  const completed = (text: string): void => {
    const reply: OperatorReply = { replyMessageId: ids.replyMessageId, operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId, text, ts: now() };
    emit({ type: 'operator_message_completed', ts: now(), operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId, replyMessageId: ids.replyMessageId, reply });
  };
  const failed = (code: string, message: string): void =>
    emit({ type: 'operator_message_failed', ts: now(), operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId, replyMessageId: ids.replyMessageId, error: { code, message } });

  let resp: LabChatResponse;
  try {
    resp = await deps.chat.send({ message: msg.text, sessionId: ids.conversationId, channel: 'web' });
  } catch (e) {
    const err = e as { office?: { code: string }; message?: string };
    failed(err.office?.code ?? 'chat_error', err.message ?? 'chat ingress error');
    return;
  }

  switch (resp.kind) {
    case 'needs_clarification': completed(resp.question); return;
    case 'out_of_scope': completed(resp.message); return;
    case 'help': completed(resp.supportedIntents.length ? `${resp.message} (${resp.supportedIntents.join(', ')})` : resp.message); return;
    case 'capability_not_available': completed(resp.message); return;
    case 'rejected': failed('rejected', resp.reason); return;
    case 'error': failed('error', resp.message); return;
    case 'task_created':
      progress('task_created', `${resp.taskType} · ${resp.taskId}`);
      startFollow({ ids, taskId: resp.taskId, taskType: resp.taskType, nextTaskType: resp.plannedNextStep?.taskType, emit });
      return;
    case 'task_status':
      if (resp.status === 'completed') { completed(`Task ${resp.taskId} completed`); return; }
      if (resp.status === 'failed' || resp.status === 'rejected') { failed('task_failed', `Task ${resp.taskId} ${resp.status}`); return; }
      // active statuses: accepted | queued | running → one informational reply, NO follower
      completed(`Task ${resp.taskId} is ${resp.status}`); return;
  }
}

/** Used in trading-lab mode when the chat token is unset: accept, notice, fail — never silently inert. */
export function makeChatUnavailableResponder(now: () => string = () => new Date().toISOString(), newIds = defaultNewIds()): OperatorResponder {
  return (msg, bus) => {
    assertNoExecutionAuthority(msg);
    const ids = newIds();
    bus.publish({ type: 'operator_message_accepted', ts: now(), operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId });
    bus.publish({ type: 'system_notice', ts: now(), level: 'warn', text: 'chat ingress not configured' });
    bus.publish({ type: 'operator_message_failed', ts: now(), operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId, replyMessageId: ids.replyMessageId, error: { code: 'chat_not_configured', message: 'chat ingress not configured' } });
    return { operatorMessageId: ids.operatorMessageId, conversationId: ids.conversationId, status: 'accepted' };
  };
}
