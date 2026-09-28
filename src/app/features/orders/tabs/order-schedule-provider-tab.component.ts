import { ChangeDetectionStrategy, Component, EventEmitter, Output, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { HttpErrorResponse } from '@angular/common/http';
import { Order, OrderScheduleSuggestion, OrderService } from '../../../core/services/order.service';
import { TeamSchedulePickerComponent, TeamScheduleChoice, TeamScheduleSource } from '../../../shared/components/team-schedule-picker/team-schedule-picker.component';
import { TenantDirectoryEntry } from '../../../core/services/tenant-user.service';
import { LocalizedDatePipe } from '../../../shared/pipes/localized-date.pipe';
import { DurationMinutesPipe } from '../../../shared/pipes/duration-minutes.pipe';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SlotCandidate, SlotCandidateTableComponent } from '../../../shared/components/slot-candidate-table/slot-candidate-table.component';
import { scheduleDurationMinutes } from '../../../shared/utils/schedule-window.util';
import { formatLocalizedDate, zonedNow, zonedWallClockToInstant } from '../../../shared/i18n/date-locale';

const SCHEDULABLE_STATUSES = ['SCHEDULED', 'ASSIGNED', 'ON_HOLD'];

/**
 * Agendamento e atribuição de prestador no mesmo quadro de disponibilidade do orçamento (issue
 * de agendamento único): dia, hora e técnico deixam de ser dois passos independentes (data às
 * cegas, depois uma lista de técnicos sem noção de hora) — a lista já traz o encaixe possível de
 * cada técnico, escolher uma linha agenda e atribui ao mesmo tempo. Não reserva nada até a
 * escolha: o horário é revalidado no backend ao gravar (mesma filosofia de
 * {@code quotations.schedule}).
 */
@Component({
  selector: 'app-order-schedule-provider-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, TextareaModule, TooltipModule, TeamSchedulePickerComponent,
    LocalizedDatePipe, DurationMinutesPipe, TranslatePipe, EmptyStateComponent, SlotCandidateTableComponent],
  template: `
    <div class="space-y-4 py-4">
      <div class="flex items-center justify-between mb-1">
        <div class="text-[11px] font-medium text-app-text-secondary">{{ 'orders.scheduledHeader' | translate }}</div>
        @if (canWrite() && !panelOpen() && (order().status === 'CREATED' || order().status === 'AWAITING_RETURN' || reopenable()) && canSchedule()) {
          <p-button [label]="(order().scheduledStartAt ? 'orders.actions.reschedule' : 'orders.actions.schedule') | translate"
                    [text]="true" size="small" (onClick)="openPanel()"></p-button>
        }
      </div>

      @if (!panelOpen() && isBlockedReturn()) {
        <div class="text-xs text-app-warning flex items-center gap-1.5 mb-2">
          <i class="pi pi-lock"></i>{{ 'orders.returnWaitingHint' | translate }}
        </div>
      }

      @if (!panelOpen()) {
        @if (order().scheduledStartAt) {
          <div class="text-sm font-medium text-app-text">
            {{ 'common.estimatedArrival' | translate }}: {{ order().scheduledStartAt | localizedDate:'datetime':tenantTimezone() }}
          </div>
          <div class="text-xs text-app-text-tertiary">{{ 'common.estimatedDuration' | translate: { duration: (scheduleDurationMinutes(order().scheduledStartAt!, order().scheduledEndAt!) | durationMinutes) } }}</div>
        } @else {
          <div class="text-sm text-app-text-tertiary">{{ 'orders.noSchedule' | translate }}</div>
        }

        <div class="border-t border-app-border-subtle pt-3 mt-3">
          <div class="text-[11px] font-medium text-app-text-secondary mb-1">{{ 'orders.technicianLabel' | translate }}</div>
          @if (order().technicianId || order().technicianIds.length) {
            <div class="text-sm font-medium text-app-text">{{ getTechnicianDisplayFull() }}</div>
          } @else {
            <div class="text-sm text-app-text-tertiary">{{ 'orders.unassigned' | translate }}</div>
          }
        </div>
      } @else {
        <div [formGroup]="reasonForm">
          @if (order().technicianId) {
            <div class="mb-3">
              <label class="block text-[11px] font-medium text-app-text-secondary mb-1">{{ 'orders.reassignReasonLabel' | translate }}</label>
              <textarea pTextarea formControlName="reason" rows="2" class="w-full"
                        [placeholder]="'orders.reassignReasonPlaceholder' | translate"></textarea>
            </div>
          }

          @if (loadingSuggestions()) {
            <div class="text-sm text-app-text-tertiary py-4 text-center">{{ 'common.loading' | translate }}</div>
          } @else if (teamMode()) {
            <!-- equipes: o seletor abaixo ocupa o lugar da lista de técnicos sozinhos -->
          } @else if (suggestionsLoaded() && suggestions().length === 0) {
            <app-empty-state icon="pi pi-calendar-times" [message]="'orders.schedule.noSuggestions' | translate"></app-empty-state>
          } @else if (suggestions().length > 0) {
            <app-slot-candidate-table [candidates]="candidates()" [choosing]="choosing()"
                                      [emptyMessage]="'orders.schedule.noSuggestions' | translate"
                                      [allowCustomTime]="true"
                                      [customTimeLabel]="'orders.schedule.pickCustomTime' | translate"
                                      [customTimeSearchLabel]="'orders.schedule.search' | translate"
                                      [customTimePlaceholder]="'orders.schedule.customTimePlaceholder' | translate"
                                      [customTimeEmptyMessage]="'orders.schedule.noSuggestionsAtTime' | translate"
                                      [clearLabel]="'common.clear' | translate"
                                      [confirmLabel]="'common.confirm' | translate"
                                      [minDate]="today()" [tenantTimezone]="tenantTimezone()"
                                      [customTimeCandidates]="customTimeSlotCandidates()"
                                      [customTimeSearching]="loadingCustomTime()"
                                      [customTimeSearched]="customTimeSearched()"
                                      (choose)="onChooseCandidate($event)"
                                      (customTimeSearch)="searchCustomTime($event)"
                                      (customTimeClose)="resetCustomTimeState()" />
          }

          @if (!loadingSuggestions() && suggestionsLoaded()) {
            <div class="border-t border-app-border-subtle pt-3 mt-3 space-y-3">
              @if (!teamMode()) {
                <div class="flex items-center justify-between gap-3 flex-wrap">
                  <span class="text-xs text-app-text-tertiary">
                    {{ (suggestions().length === 0 ? 'orders.schedule.joint.noSingleTechnician' : 'orders.schedule.joint.hint') | translate }}
                  </span>
                  <div class="flex gap-2 flex-wrap">
                    @if (suggestions().length === 0 && !extendedSingle()) {
                      <p-button [label]="'orders.schedule.joint.searchFurther' | translate" icon="pi pi-calendar-plus" size="small"
                                [text]="true" (onClick)="extendSingleSearch()" />
                    }
                    <p-button [label]="'orders.schedule.joint.open' | translate" icon="pi pi-users" size="small"
                              [outlined]="true" (onClick)="openTeamMode()" />
                  </div>
                </div>
              } @else {
                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-app-text">{{ 'orders.schedule.joint.title' | translate }}</span>
                    <p-button [label]="'common.back' | translate" icon="pi pi-arrow-left" [text]="true" size="small"
                              (onClick)="closeTeamMode()" />
                  </div>
                  <p class="text-xs text-app-text-tertiary">
                    {{ (suggestions().length === 0 ? 'orders.schedule.joint.noSingleTechnician' : 'orders.schedule.joint.intro') | translate }}
                  </p>
                  <app-team-schedule-picker [source]="teamSource" [saving]="savingTeam()"
                                            [tenantTimezone]="tenantTimezone()" (choose)="onTeamChosen($event)" />
                </div>
              }
            </div>
          }

          <div class="flex justify-end border-t border-app-border-subtle pt-3 mt-3">
            <p-button [label]="'common.close' | translate" [text]="true" size="small" (onClick)="panelOpen.set(false)"></p-button>
          </div>
        </div>
      }
    </div>
  `,
})
export class OrderScheduleProviderTabComponent {
  readonly scheduleDurationMinutes = scheduleDurationMinutes;
  order = input.required<Order>();
  canWrite = input(false);
  technicians = input<TenantDirectoryEntry[]>([]);
  tenantTimezone = input<string | null>(null);
  @Output() orderUpdated = new EventEmitter<Order>();

  private orderService = inject(OrderService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  reopenable = computed(() => SCHEDULABLE_STATUSES.includes(this.order().status));
  /** Devolução ainda não liberada pela lavanderia — Order#schedule/assign recusam no backend
   *  (ORDER_RETURN_NOT_READY); aqui só evita o clique que já sabemos que vai falhar. */
  canSchedule = computed(() => this.order().status !== 'AWAITING_RETURN' || this.order().returnReady);
  isBlockedReturn = computed(() => this.order().status === 'AWAITING_RETURN' && !this.order().returnReady);

  panelOpen = signal(false);
  loadingSuggestions = signal(false);
  suggestionsLoaded = signal(false);
  suggestions = signal<OrderScheduleSuggestion[]>([]);
  choosing = signal(false);
  candidates = computed<SlotCandidate[]>(() => this.suggestions().map(s => this.toSlotCandidate(s)));
  readonly reasonForm = new FormGroup({
    reason: new FormControl('', { nonNullable: true }),
  });

  /** "Hoje" no fuso do tenant, não no do browser — ver {@link zonedNow}. */
  today = computed(() => zonedNow(this.tenantTimezone()));
  // ── "Escolher outra data e horário" (nenhuma sugestão automática serviu) ─────────
  customTimeCandidates = signal<OrderScheduleSuggestion[]>([]);
  customTimeSlotCandidates = computed<SlotCandidate[]>(() => this.customTimeCandidates().map(s => this.toSlotCandidate(s)));
  loadingCustomTime = signal(false);
  customTimeSearched = signal(false);

  private toSlotCandidate(s: OrderScheduleSuggestion): SlotCandidate {
    return {
      technicianId: s.technicianUserId,
      technicianLabel: this.technicianName(s.technicianUserId),
      primaryText: formatLocalizedDate(s.startAt, this.translate.getCurrentLang(), 'weekdayDatetime', this.tenantTimezone()),
      secondaryText: (s.routeId
        ? this.translate.instant('orders.schedule.existingRoute')
        : this.translate.instant('orders.schedule.newRoute')) + ` · +${s.extraKm.toFixed(1)} km`,
      raw: s,
    };
  }

  technicianName(userId: string | null): string {
    if (!userId) return '—';
    return this.technicians().find(u => u.id === userId)?.name ?? '#' + userId.slice(0, 8);
  }

  getTechnicianDisplayFull(): string {
    const ids = this.order().technicianIds;
    if (!ids || ids.length === 0) return '—';
    return ids.map(id => this.technicianName(id)).join(', ');
  }

  openPanel(): void {
    this.closeTeamMode();
    this.extendedSingle.set(false);
    this.reasonForm.reset({ reason: '' });
    this.panelOpen.set(true);
    this.loadSuggestions();
  }

  /** Sem técnico sozinho livre, o sistema já mostra as equipes possíveis — o operador não precisa
   *  descobrir que existe o agendamento com mais de um técnico. */
  private loadSuggestions(horizonDays?: number): void {
    this.suggestions.set([]);
    this.suggestionsLoaded.set(false);
    this.loadingSuggestions.set(true);
    this.resetCustomTimeState();
    this.orderService.scheduleSuggestions(this.order().id, horizonDays ? { horizonDays } : undefined).subscribe({
      next: list => {
        this.loadingSuggestions.set(false);
        this.suggestionsLoaded.set(true);
        this.suggestions.set(list);
        if (list.length === 0 && !this.teamMode()) {
          this.openTeamMode();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.loadingSuggestions.set(false);
        this.suggestionsLoaded.set(true);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'orders.schedule.suggestionsError') });
      },
    });
  }

  /** X do seletor de "Escolher outra data e horário" — limpa também os resultados da busca
   *  anterior, senão reabrir o seletor mostraria candidatos de um instante que já não está
   *  selecionado em lugar nenhum. */
  resetCustomTimeState(): void {
    this.customTimeCandidates.set([]);
    this.customTimeSearched.set(false);
    this.loadingCustomTime.set(false);
  }

  /** Busca de "Escolher outra data e horário": quais técnicos elegíveis conseguem exatamente o
   *  instante escolhido pelo utilizador, no lugar da janela de dias automática. */
  searchCustomTime(at: Date): void {
    this.loadingCustomTime.set(true);
    this.customTimeSearched.set(false);
    const instant = zonedWallClockToInstant(at, this.tenantTimezone());
    this.orderService.scheduleSuggestions(this.order().id, { at: instant.toISOString() }).subscribe({
      next: list => {
        this.loadingCustomTime.set(false);
        this.customTimeSearched.set(true);
        this.customTimeCandidates.set(list);
      },
      error: (err: HttpErrorResponse) => {
        this.loadingCustomTime.set(false);
        this.customTimeSearched.set(true);
        this.customTimeCandidates.set([]);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'orders.schedule.suggestionsError') });
      },
    });
  }

  // ── Agendamento com mais de um técnico (ordem grande demais para um só, ou sem técnico livre) ──
  teamMode = signal(false);
  extendedSingle = signal(false);
  savingTeam = signal(false);
  /** O seletor de equipes só conhece esta ordem por estes três pontos — a regra é do backend. */
  readonly teamSource: TeamScheduleSource = {
    suggest: days => this.orderService.jointSuggestions(this.order().id, days),
    eligible: () => this.orderService.jointEligibleTechnicians(this.order().id),
    check: (ids, startIso) => this.orderService.jointCompatibility(this.order().id, ids, startIso),
  };

  openTeamMode(): void {
    this.teamMode.set(true);
  }

  closeTeamMode(): void {
    this.teamMode.set(false);
    this.savingTeam.set(false);
  }

  onTeamChosen(choice: TeamScheduleChoice): void {
    const reason = this.reasonForm.getRawValue().reason.trim();
    this.savingTeam.set(true);
    this.orderService.chooseJointSchedule(this.order().id, choice.technicianIds, choice.startAt, reason || undefined).subscribe({
      next: updated => {
        this.savingTeam.set(false);
        this.closeTeamMode();
        this.panelOpen.set(false);
        this.orderUpdated.emit(updated);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('orders.schedule.saved') });
      },
      error: (err: HttpErrorResponse) => {
        this.savingTeam.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'orders.schedule.saveError') });
      },
    });
  }

  /** Nenhum técnico sozinho coube nos próximos dias: amplia a busca em vez de deixar o beco sem saída. */
  extendSingleSearch(): void {
    this.extendedSingle.set(true);
    this.loadSuggestions(30);
  }


  onChooseCandidate(candidate: SlotCandidate): void {
    this.chooseSlot(candidate.raw as OrderScheduleSuggestion);
  }

  chooseSlot(suggestion: OrderScheduleSuggestion): void {
    const reason = this.reasonForm.getRawValue().reason.trim();
    this.choosing.set(true);
    this.orderService.chooseSchedule(this.order().id, suggestion.technicianUserId, suggestion.startAt,
      suggestion.endAt, reason || undefined).subscribe({
      next: updated => {
        this.choosing.set(false);
        this.panelOpen.set(false);
        this.orderUpdated.emit(updated);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('orders.schedule.saved') });
      },
      error: (err: HttpErrorResponse) => {
        this.choosing.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'orders.schedule.saveError') });
      },
    });
  }

  private businessError(err: HttpErrorResponse, fallbackKey: string): string {
    const code = (err.error as { errorCode?: string } | null)?.errorCode;
    if (err.status === 422 && code) {
      const key = `orders.errors.${code}`;
      const translated = this.translate.instant(key);
      if (translated !== key) return translated;
    }
    return this.translate.instant(fallbackKey);
  }
}
