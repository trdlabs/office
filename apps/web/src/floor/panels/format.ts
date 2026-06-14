export const dash = '—';
export const fmtNum = (n: number | null, digits = 2): string => (n === null ? dash : n.toFixed(digits));
export const fmtPct = (n: number | null, digits = 1): string => (n === null ? dash : `${n.toFixed(digits)}%`);
export const fmtText = (s: string | null): string => (s === null || s === '' ? dash : s);
