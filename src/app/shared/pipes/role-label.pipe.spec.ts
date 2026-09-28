import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { RoleLabelPipe, translateRole } from './role-label.pipe';

const ROLE_LABELS: Record<string, string> = {
  'roles.TECHNICIAN': 'Técnico',
  'roles.FINANCE': 'Financeiro',
  'common.andOthers': 'e mais {{count}}',
};

function fakeTranslate() {
  return {
    instant: vi.fn((key: string, params?: Record<string, unknown>) => {
      const template = ROLE_LABELS[key] ?? key;
      if (!params) return template;
      return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(params[name] ?? ''));
    }),
  };
}

function withTranslate() {
  const translate = fakeTranslate();
  TestBed.configureTestingModule({ providers: [{ provide: TranslateService, useValue: translate }] });
  return translate;
}

describe('translateRole', () => {
  it('translates a known role code', () => {
    const translate = fakeTranslate();
    expect(translateRole(translate as any, 'TECHNICIAN')).toBe('Técnico');
  });

  it('falls back to the raw code when there is no translation (unknown role)', () => {
    const translate = fakeTranslate();
    expect(translateRole(translate as any, 'SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });

  it('returns an empty string for null/undefined', () => {
    const translate = fakeTranslate();
    expect(translateRole(translate as any, null)).toBe('');
    expect(translateRole(translate as any, undefined)).toBe('');
  });
});

describe('RoleLabelPipe', () => {
  it('translates the role via the injected TranslateService', () => {
    withTranslate();
    const pipe = TestBed.runInInjectionContext(() => new RoleLabelPipe());
    expect(pipe.transform('FINANCE')).toBe('Financeiro');
  });
});
