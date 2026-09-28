import { describe, expect, it } from 'vitest';
import { mediaObjectKey, mediaUrl } from './media-url';

// environment.apiUrl in this workspace is 'http://localhost:8080/api/v1' (see
// src/environments/environment.ts) — origin is 'http://localhost:8080'.
const ORIGIN = 'http://localhost:8080';

describe('mediaUrl', () => {
  it('resolves a bare storage object key', () => {
    expect(mediaUrl('photos/abc.jpg')).toBe(`${ORIGIN}/api/v1/files/photos/abc.jpg`);
  });

  it('resolves a root-relative public path unchanged in origin', () => {
    expect(mediaUrl('/api/v1/files/photos/abc.jpg')).toBe(`${ORIGIN}/api/v1/files/photos/abc.jpg`);
  });

  it('never double-prefixes a path that already carries /api/v1/files', () => {
    const resolved = mediaUrl('/api/v1/files/photos/abc.jpg');
    expect(resolved).not.toContain('/files//api/v1/files');
    expect(resolved.match(/\/api\/v1\/files/g)).toHaveLength(1);
  });

  it('passes an absolute http(s) URL through untouched', () => {
    expect(mediaUrl('https://cdn.example.com/x.png')).toBe('https://cdn.example.com/x.png');
    expect(mediaUrl('http://cdn.example.com/x.png')).toBe('http://cdn.example.com/x.png');
  });

  it('passes data: and blob: references through untouched', () => {
    expect(mediaUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(mediaUrl('blob:http://localhost/abc')).toBe('blob:http://localhost/abc');
  });

  it('strips a leading slash from a bare key before prefixing', () => {
    expect(mediaUrl('/photos/abc.jpg')).toBe(`${ORIGIN}/api/v1/files/photos/abc.jpg`);
  });

  it('returns an empty string for empty, null or undefined input', () => {
    expect(mediaUrl('')).toBe('');
    expect(mediaUrl(null)).toBe('');
    expect(mediaUrl(undefined)).toBe('');
    expect(mediaUrl('   ')).toBe('');
  });
});

describe('mediaObjectKey', () => {
  it('strips the /api/v1/files/ prefix from a public path', () => {
    expect(mediaObjectKey('/api/v1/files/photos/abc.jpg')).toBe('photos/abc.jpg');
  });

  it('strips the prefix even when a full origin precedes it', () => {
    expect(mediaObjectKey(`${ORIGIN}/api/v1/files/photos/abc.jpg`)).toBe('photos/abc.jpg');
  });

  it('leaves a bare object key unchanged', () => {
    expect(mediaObjectKey('photos/abc.jpg')).toBe('photos/abc.jpg');
  });

  it('returns undefined for empty, null or undefined input', () => {
    expect(mediaObjectKey('')).toBeUndefined();
    expect(mediaObjectKey(null)).toBeUndefined();
    expect(mediaObjectKey(undefined)).toBeUndefined();
  });
});
