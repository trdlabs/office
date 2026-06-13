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
    const loggedIn = { user: { name: 'Alex' } };
    expect(sessionReducer(loggedIn, { type: 'logout' }).user).toBeNull();
  });
});

describe('shouldRedirect', () => {
  it('redirects floor routes when logged out', () => {
    expect(shouldRedirect(initialSession, '/floor/trading-lab')).toBe(true);
  });
  it('allows floor routes when logged in', () => {
    expect(shouldRedirect({ user: { name: 'A' } }, '/floor/trading-lab')).toBe(false);
  });
  it('never redirects the lobby', () => {
    expect(shouldRedirect(initialSession, '/')).toBe(false);
  });
});
