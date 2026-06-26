import { describe, expect, it } from 'vitest';
import { initialSession, sessionReducer, shouldRedirect } from './session';

describe('sessionReducer', () => {
  it('logs in with the given name', () => {
    const s = sessionReducer(initialSession, { type: 'login', name: 'Alex' });
    expect(s.user).toEqual({ name: 'Alex' });
  });

  it('falls back to a default name when empty', () => {
    const s = sessionReducer(initialSession, { type: 'login', name: '' });
    expect(s.user?.name).toBe('Trader');
  });

  it('logs out', () => {
    const loggedIn = { user: { name: 'Alex' }, token: 'tok' };
    const out = sessionReducer(loggedIn, { type: 'logout' });
    expect(out.user).toBeNull();
    expect(out.token).toBeNull();
  });

  it('carries a session token when one is provided', () => {
    const s = sessionReducer(initialSession, { type: 'login', name: 'Alex', token: 'jwt-123' });
    expect(s.token).toBe('jwt-123');
  });

  it('defaults the token to null when login omits it (open / mock mode)', () => {
    const s = sessionReducer(initialSession, { type: 'login', name: 'Alex' });
    expect(s.token).toBeNull();
  });
});

describe('shouldRedirect', () => {
  it('redirects floor routes when logged out', () => {
    expect(shouldRedirect(initialSession, '/floor/trading-lab')).toBe(true);
  });
  it('allows floor routes when logged in', () => {
    expect(shouldRedirect({ user: { name: 'A' }, token: null }, '/floor/trading-lab')).toBe(false);
  });
  it('never redirects the lobby', () => {
    expect(shouldRedirect(initialSession, '/')).toBe(false);
  });
});
