import { describe, it, expect } from 'vitest';
import { buildScorecardPath } from './scorecardPath';

describe('buildScorecardPath', () => {
  // Local canonical-path regression test. This guards the OFFICE builder against a
  // local change only — it cannot detect a change to Lab's route (Office cannot see
  // Lab's router). Real cross-repo drift is caught by staging/E2E. Canonical shape is
  // defined by the R5c-lab spec (trdlabs/lab#180).
  it('builds the canonical /v1 scorecard markdown path', () => {
    expect(buildScorecardPath('c1')).toBe('/v1/cycles/c1/scorecard?format=markdown');
  });
  it('percent-encodes the correlationId', () => {
    expect(buildScorecardPath('a/b c')).toBe('/v1/cycles/a%2Fb%20c/scorecard?format=markdown');
  });
  it('a "." / ".." correlationId cannot collapse the path via URL normalization (no traversal)', () => {
    // encodeURIComponent leaves dots literal. Per the WHATWG URL spec, a "double-dot path segment"
    // is defined as ".." OR an ASCII case-insensitive match for ".%2e", "%2e.", or "%2e%2e" — so
    // new URL()/server path normalization DECODES %2E and still collapses it as a real dot segment
    // (empirically verified: new URL('/v1/cycles/%2E%2E/x', 'http://h').pathname === '/v1/x' on
    // Node 24). A single percent-encode of the dots is therefore NOT sufficient defense — deviation
    // from the task-1-brief's originally proposed `%2E` mitigation, which does not actually block
    // traversal. Percent-encoding the '%' as well, in exactly the all-dots case, makes the literal
    // "%2E" text survive URL normalization undecoded. (Real Lab correlationIds are UUIDs — this is
    // defense in depth.)
    expect(buildScorecardPath('..')).toBe('/v1/cycles/%252E%252E/scorecard?format=markdown');
    expect(buildScorecardPath('.')).toBe('/v1/cycles/%252E/scorecard?format=markdown');
    expect(new URL(buildScorecardPath('..'), 'http://lab').pathname).toBe('/v1/cycles/%252E%252E/scorecard');
  });
});
