import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { DateFormatKind, formatLocalizedDate } from '../i18n/date-locale';

/**
 * Formats a date/time value according to the user's selected locale.
 *
 * Impure so it re-renders when the active locale changes (a locale switch
 * triggers change detection through the surrounding `translate` pipes); the
 * underlying Intl formatters are cached, so re-evaluation stays cheap.
 *
 * Usage:
 *   {{ value | localizedDate }}            // date       → 23/07/2026
 *   {{ value | localizedDate:'time' }}     // time       → 14:05
 *   {{ value | localizedDate:'datetime' }} // date+time  → 23/07/2026 14:05
 *   {{ value | localizedDate:'shortDate' }}// day+month  → 23/07
 *   {{ value | localizedDate:'monthYear' }}// month+year → julho de 2026
 *   {{ value | localizedDate:'datetime':tenantTimezone }} // wall-clock in the tenant's zone,
 *                                                          // not the viewer's browser zone
 */
@Pipe({ name: 'localizedDate', standalone: true, pure: false })
export class LocalizedDatePipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(
    value: string | number | Date | null | undefined,
    kind: DateFormatKind = 'date',
    timeZone?: string | null,
  ): string {
    return formatLocalizedDate(value, this.translate.getCurrentLang(), kind, timeZone);
  }
}
