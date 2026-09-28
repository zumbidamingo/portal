import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { LocalizedDatePipe } from './localized-date.pipe';

function pipeWithLang(lang: string | null) {
  const getCurrentLang = vi.fn(() => lang);
  TestBed.configureTestingModule({
    providers: [{ provide: TranslateService, useValue: { getCurrentLang } }],
  });
  const pipe = TestBed.runInInjectionContext(() => new LocalizedDatePipe());
  return { pipe, getCurrentLang };
}

describe('LocalizedDatePipe', () => {
  it('formats using the locale currently selected in TranslateService', () => {
    const { pipe, getCurrentLang } = pipeWithLang('pt');
    expect(pipe.transform('2026-07-23')).toBe('23/07/2026');
    // Proves the pipe is locale-driven rather than a hardcoded locale.
    expect(getCurrentLang).toHaveBeenCalled();
  });

  it('re-reads the locale on each call so a locale switch takes effect', () => {
    let lang = 'pt';
    TestBed.configureTestingModule({
      providers: [{ provide: TranslateService, useValue: { getCurrentLang: () => lang } }],
    });
    const pipe = TestBed.runInInjectionContext(() => new LocalizedDatePipe());
    expect(pipe.transform('2026-07-23', 'shortDate')).toBe('23/07');
    lang = 'en';
    expect(pipe.transform('2026-07-23', 'shortDate')).toBe('07/23');
  });

  it('passes the requested format kind through', () => {
    const { pipe } = pipeWithLang('pt');
    expect(pipe.transform('2026-07-23', 'datetime')).toContain('23/07/2026');
  });

  it('renders a placeholder for missing values', () => {
    const { pipe } = pipeWithLang('pt');
    expect(pipe.transform(null)).toBe('-');
    expect(pipe.transform(undefined)).toBe('-');
  });

  it('falls back to en-GB when no locale is set', () => {
    const { pipe } = pipeWithLang(null);
    expect(pipe.transform('2026-07-23')).toBe('23/07/2026');
  });
});
