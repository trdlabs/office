// Filters internal/plumbing agent-event types out of the operator chat delta stream.
// NOTE: terminal/failure detection is done BEFORE this filter (see ConversationFollower),
// so e.g. `chat.plan.advance_failed` is still handled as a failure even though it is "noise" here.
const NOISE_PREFIXES = ['chat.intent_', 'chat.task_created', 'chat.plan.'];
const NOISE_SUFFIXES = ['deduped', 'reused', 'stored', 'skipped'];

export function isNoiseEventType(type: string): boolean {
  if (NOISE_PREFIXES.some((p) => type.startsWith(p))) return true;
  const suffix = type.split(/[._]/).pop() ?? '';
  return NOISE_SUFFIXES.includes(suffix);
}
