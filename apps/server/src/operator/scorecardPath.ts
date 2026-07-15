// Office constructs this path from a correlationId it obtained via the trusted agent-event
// stream — it never follows a DTO-supplied URL (security invariant, R5c-lab spec). The branded
// type is the only value getScorecardMarkdown accepts, so no un-validated string can reach fetch.
export type ValidatedScorecardPath = string & { readonly __scorecardPath: unique symbol };

export function buildScorecardPath(correlationId: string): ValidatedScorecardPath {
  let seg = encodeURIComponent(correlationId);
  // encodeURIComponent leaves dots literal. Per the WHATWG URL spec, a "double-dot path segment"
  // is defined as ".." OR an ASCII case-insensitive match for ".%2e", "%2e.", or "%2e%2e" — so
  // new URL()/the server's path normalization DECODES %2E and still collapses it as a real dot
  // segment (empirically verified: new URL('/v1/cycles/%2E%2E/x', 'http://h').pathname ===
  // '/v1/x' on Node 24). A single percent-encode of the dots is therefore NOT sufficient defense.
  // Percent-encode the '%' as well, in exactly the all-dots case, so the literal "%2E" text
  // survives URL normalization undecoded. Real Lab correlationIds are UUID-shaped (no dot-only
  // segment), so this never fires in practice — it's defense in depth.
  if (/^\.+$/.test(seg)) seg = seg.replace(/\./g, '%252E');
  return `/v1/cycles/${seg}/scorecard?format=markdown` as ValidatedScorecardPath;
}
