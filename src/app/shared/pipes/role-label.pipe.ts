import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/**
 * Translates a backend role code (`WAITER`, `CHEF`, …) into the active locale.
 *
 * Falls back to the raw code when no translation exists, so an unknown role never
 * leaks a translation key such as `roles.SOMETHING_NEW` into the UI.
 *
 * Impure so it re-renders when the active locale changes, matching
 * `LocalizedDatePipe`.
 *
 * Usage:
 *   {{ job.role | roleLabel }}
 */
@Pipe({ name: 'roleLabel', standalone: true, pure: false })
export class RoleLabelPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(value: string | null | undefined): string {
    return translateRole(this.translate, value);
  }
}

/**
 * Shared role translation used by the pipe above and by TypeScript call sites
 * that build strings outside a template (map popups, confirm dialogs).
 */
export function translateRole(translate: TranslateService, value: string | null | undefined): string {
  if (!value) return '';

  const key = `roles.${value}`;
  const translated = translate.instant(key);
  return translated === key ? value : translated;
}
