import { OFFICE_API } from '@trading-office/office-gateway';

export interface LoginResult {
  /** True when the server enforces auth (a token was issued). */
  authRequired: boolean;
  /** The session token to send on subsequent requests; null in open mode. */
  token: string | null;
}

/** Thrown when the operator password is rejected (or login otherwise fails). */
export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginError';
  }
}

/**
 * Exchange the operator password for a session token at the office server.
 * The password is sent once, over the wire to the server (the only place it is
 * verified); the returned token is what the client stores and replays.
 */
export async function loginOperator(
  baseUrl: string,
  password: string,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = (input, init) => fetch(input, init),
): Promise<LoginResult> {
  const res = await fetchImpl(baseUrl.replace(/\/$/, '') + OFFICE_API.operatorLogin, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.status === 401) throw new LoginError('invalid operator password');
  if (!res.ok) throw new LoginError(`login failed: ${res.status}`);
  const body = (await res.json()) as { authRequired?: boolean; token?: string | null };
  return { authRequired: Boolean(body.authRequired), token: body.token ?? null };
}
