import { describe, it, expect } from 'vitest';
import { fmtNum, fmtPct, fmtText, dash } from './format';

describe('format fallbacks (null → —)', () => {
  it('formats or dashes', () => {
    expect(fmtPct(null)).toBe(dash);
    expect(fmtPct(4.25)).toBe('4.3%');
    expect(fmtNum(null)).toBe(dash);
    expect(fmtNum(1.5)).toBe('1.50');
    expect(fmtText(null)).toBe(dash);
    expect(fmtText('')).toBe(dash);
    expect(fmtText('BTC')).toBe('BTC');
  });
});
