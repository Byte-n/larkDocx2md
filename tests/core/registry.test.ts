import { describe, it, expect } from 'vitest';
import { Registry } from '../../src/core/registry.js';

describe('Registry', () => {
  it('registers and retrieves a value', () => {
    const reg = new Registry<string, number>();
    reg.register('a', 1);
    expect(reg.get('a')).toBe(1);
  });

  it('returns undefined for unregistered key', () => {
    const reg = new Registry<string, number>();
    expect(reg.get('missing')).toBeUndefined();
  });

  it('has() returns true/false correctly', () => {
    const reg = new Registry<string, number>();
    reg.register('x', 42);
    expect(reg.has('x')).toBe(true);
    expect(reg.has('y')).toBe(false);
  });

  it('overwrites existing key', () => {
    const reg = new Registry<string, string>();
    reg.register('k', 'old');
    reg.register('k', 'new');
    expect(reg.get('k')).toBe('new');
  });

  it('getAll returns a read-only map of all entries', () => {
    const reg = new Registry<string, number>();
    reg.register('a', 1);
    reg.register('b', 2);
    const all = reg.getAll();
    expect(all.size).toBe(2);
    expect(all.get('a')).toBe(1);
    expect(all.get('b')).toBe(2);
  });
});
