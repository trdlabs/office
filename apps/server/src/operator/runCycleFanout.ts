export interface RunCycleConsumer {
  register(runCycleTaskId: string, conversationId: string): void;
}

/** Build the onRunCycleTask callback that fans out to every present consumer. Returns undefined
 *  when none are present (so the responder's optional onRunCycleTask stays undefined). */
export function makeRunCycleFanout(
  consumers: Array<RunCycleConsumer | undefined>,
): ((runCycleTaskId: string, conversationId: string) => void) | undefined {
  const active = consumers.filter((c): c is RunCycleConsumer => c !== undefined);
  if (active.length === 0) return undefined;
  return (runCycleTaskId, conversationId) => {
    for (const c of active) c.register(runCycleTaskId, conversationId);
  };
}
