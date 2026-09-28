import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { DurationMinutesPipe } from './duration-minutes.pipe';

const LABELS: Record<string, string> = {
  'common.durationHoursMinutes': '{{hours}}h {{minutes}}min',
  'common.durationHoursOnly': '{{hours}}h',
  'common.durationMinutesOnly': '{{minutes}} min',
};

function withTranslate() {
  const translate = {
    instant: vi.fn((key: string, params?: Record<string, unknown>) => {
      const template = LABELS[key] ?? key;
      return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(params?.[name] ?? ''));
    }),
  };
  TestBed.configureTestingModule({ providers: [{ provide: TranslateService, useValue: translate }] });
  return translate;
}

describe('DurationMinutesPipe', () => {
  it('formats a sub-hour value as minutes only', () => {
    withTranslate();
    const pipe = TestBed.runInInjectionContext(() => new DurationMinutesPipe());
    expect(pipe.transform(27)).toBe('27 min');
  });

  it('formats an exact-hour value without a minutes remainder', () => {
    withTranslate();
    const pipe = TestBed.runInInjectionContext(() => new DurationMinutesPipe());
    expect(pipe.transform(120)).toBe('2h');
  });

  it('formats hours and minutes together', () => {
    withTranslate();
    const pipe = TestBed.runInInjectionContext(() => new DurationMinutesPipe());
    expect(pipe.transform(628)).toBe('10h 28min');
  });

  it('returns an empty string for null/undefined', () => {
    withTranslate();
    const pipe = TestBed.runInInjectionContext(() => new DurationMinutesPipe());
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });
});
