import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/**
 * Formats a minute count as "10h 28min" instead of the raw "628 min" — legible past the point
 * where a route's total time (travel + service) routinely crosses an hour.
 *
 * Impure so it re-renders on a locale switch, same reasoning as `LocalizedDatePipe`.
 */
@Pipe({ name: 'durationMinutes', standalone: true, pure: false })
export class DurationMinutesPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(totalMinutes: number | null | undefined): string {
    if (totalMinutes == null) return '';
    const minutes = Math.round(totalMinutes);
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (hours === 0) {
      return this.translate.instant('common.durationMinutesOnly', { minutes: remainder });
    }
    if (remainder === 0) {
      return this.translate.instant('common.durationHoursOnly', { hours });
    }
    return this.translate.instant('common.durationHoursMinutes', { hours, minutes: remainder });
  }
}
