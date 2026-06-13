import type { OperatorMessage } from '@trading-office/office-gateway';

export class ExecutionAuthorityError extends Error {}

/**
 * The single chokepoint the operator path passes through. The office has NO
 * execution authority: an operator message may only target the orchestrator for
 * reporting. This performs no side effects and reaches no connector (there is no
 * write path to reach) — it returns the validated message or throws.
 */
export function assertNoExecutionAuthority(msg: OperatorMessage): OperatorMessage {
  if (msg.target !== 'orchestrator') {
    throw new ExecutionAuthorityError(
      `operator message target '${msg.target}' is not permitted (no execution authority)`,
    );
  }
  return msg;
}
