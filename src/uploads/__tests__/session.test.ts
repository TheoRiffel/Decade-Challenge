import { describe, expect, it } from 'vitest';
import { createUploadSession } from '../session.js';

const SAMPLE: Omit<import('../session.js').ParsedUpload, 'fileId'> = {
  filename: 'report.pdf',
  mimeType: 'application/pdf',
  content: 'some text',
  truncated: false,
};

describe('createUploadSession', () => {
  it('add returns an entry with a generated fileId', () => {
    const session = createUploadSession();
    const entry = session.add(SAMPLE);
    expect(typeof entry.fileId).toBe('string');
    expect(entry.fileId.length).toBeGreaterThan(0);
    expect(entry.filename).toBe(SAMPLE.filename);
    expect(entry.content).toBe(SAMPLE.content);
    expect(entry.truncated).toBe(false);
  });

  it('get retrieves entry by fileId', () => {
    const session = createUploadSession();
    const added = session.add(SAMPLE);
    const retrieved = session.get(added.fileId);
    expect(retrieved).toEqual(added);
  });

  it('get returns undefined for unknown fileId', () => {
    const session = createUploadSession();
    expect(session.get('nonexistent-id')).toBeUndefined();
  });

  it('list returns all added uploads', () => {
    const session = createUploadSession();
    const a = session.add({ ...SAMPLE, filename: 'a.pdf' });
    const b = session.add({ ...SAMPLE, filename: 'b.xlsx' });
    const list = session.list();
    expect(list).toHaveLength(2);
    expect(list.map((e) => e.fileId)).toContain(a.fileId);
    expect(list.map((e) => e.fileId)).toContain(b.fileId);
  });

  it('each add generates a unique fileId', () => {
    const session = createUploadSession();
    const ids = Array.from({ length: 10 }, () => session.add(SAMPLE).fileId);
    expect(new Set(ids).size).toBe(10);
  });

  it('sessions are independent', () => {
    const s1 = createUploadSession();
    const s2 = createUploadSession();
    s1.add(SAMPLE);
    expect(s2.list()).toHaveLength(0);
  });
});
