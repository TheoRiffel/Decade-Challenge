import { describe, expect, it } from 'vitest';
import { FileParseError } from '../parse.js';

describe('FileParseError', () => {
  it('sets name, message, and reason', () => {
    const err = new FileParseError('bad file', 'corrupted');
    expect(err.name).toBe('FileParseError');
    expect(err.message).toBe('bad file');
    expect(err.reason).toBe('corrupted');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FileParseError);
  });

  it('accepts all four reason codes', () => {
    const reasons = ['unsupported_format', 'corrupted', 'too_large', 'extraction_failed'] as const;
    for (const reason of reasons) {
      expect(new FileParseError('msg', reason).reason).toBe(reason);
    }
  });

  it('stores cause when provided', () => {
    const original = new Error('root cause');
    const err = new FileParseError('wrapper', 'extraction_failed', original);
    expect(err.cause).toBe(original);
  });

  it('cause is undefined when not provided', () => {
    const err = new FileParseError('msg', 'too_large');
    expect(err.cause).toBeUndefined();
  });
});
