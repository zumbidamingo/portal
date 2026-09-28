import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeService } from './theme.service';

const KEY = 'suaoperacao_theme';

describe('ThemeService', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    // Armazenamento em memória: o Node recente expõe um `localStorage` global incompleto que
    // se sobrepõe ao do jsdom, e este spec não deve depender de qual dos dois ganha.
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
    document.documentElement.removeAttribute('data-theme');
    TestBed.resetTestingModule();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('defaults to system when nothing is stored', () => {
    expect(TestBed.inject(ThemeService).mode()).toBe('system');
  });

  it('applies and persists an explicit choice', () => {
    const service = TestBed.inject(ThemeService);
    service.setMode('dark');

    expect(service.resolved()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(store.get(KEY)).toBe('dark');
  });

  it('restores the stored choice on the next start', () => {
    store.set(KEY, 'light');

    expect(TestBed.inject(ThemeService).mode()).toBe('light');
  });

  it('restores the server preference over the local one', () => {
    store.set(KEY, 'light');
    const service = TestBed.inject(ThemeService);
    service.restore('dark');

    expect(service.mode()).toBe('dark');
    expect(store.get(KEY)).toBe('dark');
  });

  it('keeps the local choice when the server has none or an unknown value', () => {
    store.set(KEY, 'light');
    const service = TestBed.inject(ThemeService);
    service.restore(null);
    service.restore('sepia');

    expect(service.mode()).toBe('light');
  });

  it('ignores a stored value that is not a known mode', () => {
    store.set(KEY, 'sepia');

    expect(TestBed.inject(ThemeService).mode()).toBe('system');
  });
});
