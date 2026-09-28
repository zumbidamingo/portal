import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { DaySummary } from './routing-models';
import { DurationMinutesPipe } from '../../shared/pipes/duration-minutes.pipe';

/** Resumo do dia (ponto 5 do briefing): técnicos, paradas, OS e distância/tempo quando
 *  disponíveis — nunca inventa um total sobre rotas que ainda não foram calculadas. */
@Component({
  selector: 'app-routing-summary-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslatePipe, DurationMinutesPipe],
  template: `
    <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-app-text-secondary">
      <span class="flex items-center gap-1.5">
        <i class="pi pi-users text-xs text-app-text-tertiary"></i>
        {{ 'routing.summary.technicians' | translate: { count: summary().technicianCount } }}
      </span>
      <span class="flex items-center gap-1.5">
        <i class="pi pi-map-marker text-xs text-app-text-tertiary"></i>
        {{ 'routing.summary.stops' | translate: { count: summary().totalStops } }}
      </span>
      <span class="flex items-center gap-1.5">
        <i class="pi pi-file text-xs text-app-text-tertiary"></i>
        {{ 'routing.summary.orders' | translate: { count: summary().totalOrders } }}
      </span>
      @if (summary().totalDistanceKm != null) {
        <span class="flex items-center gap-1.5">
          <i class="pi pi-directions text-xs text-app-text-tertiary"></i>
          {{ summary().totalDistanceKm | number: '1.1-1' }} km
        </span>
      }
      @if (summary().totalDurationMinutes != null) {
        <span class="flex items-center gap-1.5">
          <i class="pi pi-clock text-xs text-app-text-tertiary"></i>
          {{ 'routing.travelTime' | translate: { duration: (summary().totalDurationMinutes | durationMinutes) } }}
        </span>
      }
      @if (summary().totalRouteMinutes != null) {
        <span class="flex items-center gap-1.5 font-medium text-app-text">
          <i class="pi pi-stopwatch text-xs text-app-text-tertiary"></i>
          {{ 'routing.totalRouteTime' | translate: { duration: (summary().totalRouteMinutes | durationMinutes) } }}
        </span>
      }
    </div>
  `,
})
export class RoutingSummaryBarComponent {
  summary = input.required<DaySummary>();
}
