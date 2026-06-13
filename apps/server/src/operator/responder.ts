import { operatorReplyChunks } from '@trading-office/office-fixtures';
import type { OperatorMessage, OperatorMessageAccepted } from '@trading-office/office-gateway';
import type { OfficeEventBus } from '../events/OfficeEventBus';
import { assertNoExecutionAuthority } from '../guard/noExecutionAuthority';

const nowIso = (): string => new Date().toISOString();

let counter = 0;

/**
 * Inert operator responder. Mints paired ids, returns 'accepted', and schedules
 * a simulated reply lifecycle on the bus. It has NO connector access and makes
 * NO outbound call — the office cannot command anything.
 */
export function handleOperatorMessage(
  raw: OperatorMessage,
  bus: OfficeEventBus,
  schedule: (fn: () => void, ms?: number) => void = (fn, ms) => {
    setTimeout(fn, ms);
  },
): OperatorMessageAccepted {
  const msg = assertNoExecutionAuthority(raw);
  const k = ++counter;
  const operatorMessageId = `m${k}`;
  const conversationId = `c${k}`;
  const replyMessageId = `r${k}`;

  bus.publish({ type: 'operator_message_accepted', ts: nowIso(), operatorMessageId, conversationId });

  const chunks = operatorReplyChunks(msg.text);
  let acc = '';
  chunks.forEach((chunk, i) => {
    schedule(() => {
      acc += chunk;
      bus.publish({
        type: 'operator_message_delta',
        ts: nowIso(),
        operatorMessageId,
        conversationId,
        replyMessageId,
        textDelta: chunk,
      });
      if (i === chunks.length - 1) {
        bus.publish({
          type: 'operator_message_completed',
          ts: nowIso(),
          operatorMessageId,
          conversationId,
          replyMessageId,
          reply: { replyMessageId, operatorMessageId, conversationId, text: acc, ts: nowIso() },
        });
      }
    }, (i + 1) * 50);
  });

  return { operatorMessageId, conversationId, status: 'accepted' };
}
