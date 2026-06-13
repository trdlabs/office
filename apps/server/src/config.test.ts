import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('defaults when env is empty', () => {
    const c = loadConfig({});
    expect(c.port).toBe(8787);
    expect(c.corsOrigin).toBe('http://localhost:5174');
    expect(c.eventTickMs).toBeGreaterThan(0);
  });
  it('reads overrides from env', () => {
    const c = loadConfig({ OFFICE_SERVER_PORT: '9999', OFFICE_CORS_ORIGIN: 'http://x' });
    expect(c.port).toBe(9999);
    expect(c.corsOrigin).toBe('http://x');
  });
});
