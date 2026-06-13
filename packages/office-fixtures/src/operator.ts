/** Inert canned reply — never an execution action. */
export function cannedOperatorReply(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('status')) return 'All seven agents are active. Evaluator hit a failed fold; researcher is re-sweeping. (no execution authority)';
  if (t.includes('pause') || t.includes('stop')) return 'No execution authority — I can only report. Nothing was paused. (no execution authority)';
  return `Acknowledged: "${text}". This office is a read-only control room — no trading actions are taken. (no execution authority)`;
}

/** Split a reply into a few deterministic streaming chunks for the lifecycle. */
export function operatorReplyChunks(text: string): string[] {
  const reply = cannedOperatorReply(text);
  const words = reply.split(' ');
  const mid = Math.ceil(words.length / 3);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += mid) {
    chunks.push(words.slice(i, i + mid).join(' ') + (i + mid < words.length ? ' ' : ''));
  }
  return chunks;
}
