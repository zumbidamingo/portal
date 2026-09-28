import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { TechnicianRow, resolveTechnicianColor } from './routing-models';

/**
 * Visão "Todos os técnicos" (ponto 2 do briefing): uma linha por técnico com rota planejada OU
 * com pedidos agendados no dia — um técnico com serviço mas sem rota ainda nunca desaparece da
 * lista, fica visível com a ação contextual de planejar.
 */
@Component({
  selector: 'app-routing-technician-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule, TagModule, TooltipModule, TranslatePipe, LocalizedDatePipe, EmptyStateComponent],
  template: `
    @if (loading()) {
      <div class="space-y-2">
        @for (i of [1, 2, 3]; track i) {
          <div class="h-16 rounded-md bg-app-surface-hover animate-pulse"></div>
        }
      </div>
    } @else if (!rows().length) {
      <app-empty-state icon="pi pi-map" [message]="'routing.technicianList.emptyMessage' | translate"
                        [subtitle]="'routing.technicianList.emptySubtitle' | translate: { date: date() | localizedDate: 'weekdayDate' }" />
    } @else {
      @if (allNotPlanned() && isDispatcher()) {
        <div class="flex items-center justify-between gap-3 mb-3 px-3 py-2 rounded-md bg-app-surface-hover text-xs text-app-text-secondary">
          <span>{{ 'routing.technicianList.notPlannedHint' | translate: { count: rows().length } }}</span>
        </div>
      }
      <div class="space-y-2">
        @for (row of rows(); track row.technicianId) {
          <button type="button"
                  class="w-full flex items-center gap-3 border border-app-border rounded-md p-3 text-left hover:bg-app-surface-hover transition-colors cursor-pointer"
                  (click)="selectTechnician.emit(row.technicianId)">
            <span class="w-1.5 self-stretch rounded-full shrink-0" [style.background]="color(row.technicianId)"></span>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium text-app-text truncate">{{ row.name }}</div>
              <div class="text-xs text-app-text-tertiary flex items-center gap-2 mt-0.5">
                <span>{{ 'routing.technicianList.stopCount' | translate: { count: row.stopCount } }}</span>
                @if (row.route && row.route!.totalDistanceKm > 0) {
                  <span>· {{ row.route!.totalDistanceKm | number: '1.1-1' }} km</span>
                }
              </div>
            </div>
            @if (row.status === 'NOT_PLANNED') {
              <p-tag [value]="'routing.technicianList.notPlanned' | translate" severity="warn" />
              @if (isDispatcher()) {
                <p-button [label]="'routing.plan' | translate" size="small" [outlined]="true" icon="pi pi-map"
                          [loading]="planningTechnicianId() === row.technicianId"
                          (onClick)="planTechnician.emit(row.technicianId); $event.stopPropagation()" />
              }
            } @else if (row.status === 'ERROR') {
              <p-tag [value]="'routing.dayResult.error' | translate" severity="danger"
                     [pTooltip]="row.errorCode ?? ''" />
            } @else {
              <p-tag [value]="('routing.status.' + row.status) | translate" [severity]="statusSeverity(row.status)" />
            }
            <i class="pi pi-chevron-right text-xs text-app-text-tertiary"></i>
          </button>
        }
      </div>
    }
  `,
})
export class RoutingTechnicianListComponent {
  rows = input.required<TechnicianRow[]>();
  loading = input(false);
  isDispatcher = input(false);
  date = input.required<string>();
  planningTechnicianId = input<string | null>(null);
  /** Cor do Prestador por `technicianId` (issue "Cor do Prestador") — hex, chave = `User.id`. */
  colorByTechnicianId = input<Map<string, string>>(new Map());

  selectTechnician = output<string>();
  planTechnician = output<string>();

  allNotPlanned = computed(() => this.rows().length > 0 && this.rows().every(r => r.status === 'NOT_PLANNED'));

  color(technicianId: string): string {
    return resolveTechnicianColor(technicianId, this.colorByTechnicianId());
  }

  statusSeverity(status: string): 'info' | 'success' | 'danger' | 'warn' {
    if (status === 'COMPLETED') return 'success';
    if (status === 'CANCELLED') return 'danger';
    if (status === 'IN_PROGRESS') return 'warn';
    return 'info';
  }
}
