import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPool } from './pool.js';

const { optionsSeen } = vi.hoisted(() => ({ optionsSeen: vi.fn() }));
vi.mock('pg', () => ({
  default: {
    Pool: class {
      constructor(options: unknown) {
        optionsSeen(options);
      }
    },
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  optionsSeen.mockClear();
});

describe('PostgreSQL transport', () => {
  it('retains verified TLS by default in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_SSL_ENABLED', undefined);
    vi.stubEnv('DATABASE_SSL_REJECT_UNAUTHORIZED', undefined);
    createPool('postgresql://test:test@database.example/test');
    expect(optionsSeen).toHaveBeenCalledWith(expect.objectContaining({
      ssl: { rejectUnauthorized: true },
    }));
  });

  it('allows the explicitly configured private Docker PostgreSQL without TLS', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_SSL_ENABLED', 'false');
    createPool('postgresql://test:test@postgres:5432/test');
    expect(optionsSeen).toHaveBeenCalledWith(expect.objectContaining({ ssl: false }));
  });
});
