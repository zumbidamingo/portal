import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SkeletonModule } from 'primeng/skeleton';
import { MessageService } from 'primeng/api';
import type { EligibleProvider, JointCompatibilityResult, TeamSuggestion, TeamSuggestions } from '../../../core/services/quotation.service';
import { DurationMinutesPipe } from '../../pipes/duration-minutes.pipe';
import { formatLocalizedDate, zonedNow, zonedWallClockToInstant } from '../../i18n/date-locale';

/** De onde o seletor tira os dados — orçamento e ordem têm endpoints próprios, a regra é a mesma. */
export interface TeamScheduleSource {
  suggest(horizonDays?: number): Observable<TeamSuggestions>;
  eligible(): Observable<EligibleProvider[]>;
  check(technicianIds: string[], startIso: string): Observable<JointCompatibilityResult>;
}

export interface TeamScheduleChoice {
  technicianIds: string[];
  startAt: string;
  endAt: string;
}

const DEFAULT_HORIZON_DAYS = 7;
const EXTENDED_HORIZON_DAYS = 30;

/**
 * Atendimento com mais de um técnico, orientado a possibilidades: o sistema já calcula equipes e
 * horários que dão (habilidade, jornada, almoço, agenda, capacidade — mesma regra da gravação) e o
 * operador só escolhe. A montagem manual continua disponível, mas só oferece técnicos com as
 * habilidades exigidas e só checa conflito depois de haver equipe E horário — nunca contra um
 * horário que ainda não existe.
 */
@Component({
  selector: 'app-team-schedule-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonModule, DatePickerModule, SkeletonModule, TranslatePipe, DurationMinutesPipe],
  template: `
    <div class="space-y-3">
      @if (!manualOpen()) {
        @if (loading()) {
          <div class="space-y-2" aria-busy="true">
            <p-skeleton height="4.5rem"></p-skeleton>
            <p-skeleton height="4.5rem"></p-skeleton>
          </div>
        } @else if (result(); as res) {
          @if (res.suggestions.length) {
            <div>
              <div class="text-sm font-medium text-app-text">{{ 'teamSchedule.suggestionsTitle' | translate }}</div>
              <div class="text-xs text-app-text-tertiary">
                {{ 'teamSchedule.suggestionsHint' | translate: { size: res.teamSize } }}
              </div>
            </div>
            <div class="space-y-2">
              @for (s of res.suggestions; track s.startAt + s.members[0].technicianUserId + s.members[1].technicianUserId) {
                <div class="border border-app-border rounded-md p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div class="space-y-1 min-w-0">
                    <div class="text-sm font-medium text-app-text">{{ slotLabel(s) }}</div>
                    <div class="text-sm text-app-text">{{ teamLabel(s) }}</div>
                    <div class="text-xs text-app-text-tertiary">
                      {{ 'teamSchedule.eachOne' | translate: { duration: (s.perTechnicianMinutes | durationMinutes) } }}
                      · {{ 'teamSchedule.allReady' | translate }}
                    </div>
                  </div>
                  <p-button [label]="'teamSchedule.choose' | translate" size="small" [loading]="saving()"
                            (onClick)="chooseSuggestion(s)"></p-button>
                </div>
              }
            </div>
            <div class="flex items-center justify-between gap-3 flex-wrap">
              @if (horizon() < extendedHorizon) {
                <p-button [label]="'teamSchedule.searchFurther' | translate" [text]="true" size="small"
                          icon="pi pi-calendar-plus" (onClick)="extendSearch()"></p-button>
              } @else {
                <span></span>
              }
              <p-button [label]="'teamSchedule.manual.open' | translate" [text]="true" size="small"
                        severity="secondary" icon="pi pi-sliders-h" (onClick)="openManual()"></p-button>
            </div>
          } @else {
            <div class="rounded-md bg-app-surface-hover px-4 py-3 space-y-2">
              @if (res.eligibleCount < 2) {
                <div class="text-sm font-medium text-app-text">{{ 'teamSchedule.empty.notEnoughSkilled' | translate }}</div>
                <div class="text-xs text-app-text-tertiary">
                  {{ 'teamSchedule.empty.notEnoughSkilledHint' | translate: { count: res.eligibleCount } }}
                </div>
              } @else {
                <div class="text-sm font-medium text-app-text">
                  {{ 'teamSchedule.empty.noTeam' | translate: { days: horizon() } }}
                </div>
                <div class="text-xs text-app-text-tertiary">{{ 'teamSchedule.empty.noTeamHint' | translate }}</div>
              }
              <div class="flex gap-2 flex-wrap pt-1">
                @if (res.eligibleCount >= 2 && horizon() < extendedHorizon) {
                  <p-button [label]="'teamSchedule.searchFurther' | translate" size="small" [outlined]="true"
                            icon="pi pi-calendar-plus" (onClick)="extendSearch()"></p-button>
                }
                @if (res.eligibleCount >= 2) {
                  <p-button [label]="'teamSchedule.manual.open' | translate" size="small" [text]="true"
                            icon="pi pi-sliders-h" (onClick)="openManual()"></p-button>
                }
              </div>
            </div>
          }
        }
      } @else {
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm font-medium text-app-text">{{ 'teamSchedule.manual.title' | translate }}</span>
          <p-button [label]="'teamSchedule.manual.backToSuggestions' | translate" icon="pi pi-arrow-left"
                    [text]="true" size="small" (onClick)="closeManual()"></p-button>
        </div>

        @if (loadingEligible()) {
          <p-skeleton height="2.25rem"></p-skeleton>
        } @else if (eligible().length < 2) {
          <div class="text-sm text-app-text-tertiary">{{ 'teamSchedule.empty.notEnoughSkilled' | translate }}</div>
        } @else {
          <div class="space-y-1.5">
            <div class="text-xs font-semibold text-app-text-tertiary">{{ 'teamSchedule.manual.select' | translate }}</div>
            <div class="flex flex-wrap gap-2">
              @for (tech of eligible(); track tech.technicianUserId) {
                <button type="button"
                        class="flex items-center gap-2 border rounded-full px-3 py-1.5 text-sm transition-colors cursor-pointer"
                        [class.border-app-accent]="selected().includes(tech.technicianUserId)"
                        [class.border-app-border]="!selected().includes(tech.technicianUserId)"
                        [attr.aria-pressed]="selected().includes(tech.technicianUserId)"
                        (click)="toggle(tech.technicianUserId)">
                  <i class="pi" [class.pi-check-circle]="selected().includes(tech.technicianUserId)"
                     [class.text-app-accent]="selected().includes(tech.technicianUserId)"
                     [class.pi-circle]="!selected().includes(tech.technicianUserId)"
                     [class.text-app-text-tertiary]="!selected().includes(tech.technicianUserId)"></i>
                  {{ tech.technicianName ?? '—' }}
                </button>
              }
            </div>
            <div class="text-xs text-app-text-tertiary">{{ 'teamSchedule.manual.onlySkilled' | translate }}</div>
          </div>

          <div class="space-y-1.5">
            <div class="text-xs font-semibold text-app-text-tertiary">{{ 'teamSchedule.manual.startLabel' | translate }}</div>
            <p-datepicker #startPicker [formControl]="startControl" [showTime]="true" hourFormat="24" dateFormat="dd/mm/yy"
                          appendTo="body" [minDate]="today()" [defaultDate]="today()" [hideOnDateTimeSelect]="false" fluid (onClose)="applyStart()"
                          [placeholder]="'teamSchedule.manual.startPlaceholder' | translate">
              <ng-template #footer>
                <div class="flex justify-between gap-2 pt-2 border-t border-app-border">
                  <p-button [label]="'common.clear' | translate" severity="secondary" [text]="true" size="small"
                            (onClick)="startControl.reset(null); startPicker.hideOverlay()"></p-button>
                  <p-button [label]="'common.confirm' | translate" icon="pi pi-check" size="small"
                            [disabled]="!startControl.value" (onClick)="startPicker.hideOverlay()"></p-button>
                </div>
              </ng-template>
            </p-datepicker>
          </div>

          @if (selected().length < 2 || !startControl.value) {
            <div class="text-xs text-app-text-tertiary">
              {{ (selected().length < 2 ? 'teamSchedule.manual.needTeam' : 'teamSchedule.manual.needStart') | translate }}
            </div>
          } @else if (checking()) {
            <p-skeleton height="4rem"></p-skeleton>
          } @else if (compat(); as c) {
            <div class="text-xs text-app-text-tertiary">
              {{ 'teamSchedule.eachOne' | translate: { duration: (c.perTechnicianMinutes | durationMinutes) } }}
            </div>
            @if (c.viable) {
              <div class="flex items-center gap-2 text-sm text-app-success">
                <i class="pi pi-check-circle"></i>{{ 'teamSchedule.manual.viable' | translate }}
              </div>
              <p-button [label]="'teamSchedule.manual.confirm' | translate" icon="pi pi-check" [loading]="saving()"
                        (onClick)="confirmManual()"></p-button>
            } @else {
              <div class="space-y-1.5">
                @for (t of c.technicians; track t.technicianUserId) {
                  @if (!t.compatible) {
                    <div class="flex items-center gap-2 text-sm border border-app-border rounded px-3 py-2">
                      <i class="pi pi-times-circle text-app-danger"></i>
                      <span>{{ t.technicianName ?? '—' }}</span>
                      @if (t.reasonCode) {
                        <span class="text-app-text-tertiary">{{ ('teamSchedule.reason.' + t.reasonCode) | translate }}</span>
                      }
                    </div>
                  }
                }
              </div>
              <div class="text-xs text-app-text-tertiary">{{ 'teamSchedule.manual.notViable' | translate }}</div>
            }
          }
        }
      }
    </div>
  `,
})
export class TeamSchedulePickerComponent implements OnInit {
  source = input.required<TeamScheduleSource>();
  saving = input(false);
  tenantTimezone = input<string | null>(null);
  choose = output<TeamScheduleChoice>();

  private translate = inject(TranslateService);
  private messageService = inject(MessageService);

  /** "Hoje" no fuso do tenant, não no do browser — ver {@link zonedNow}. */
  today = computed(() => zonedNow(this.tenantTimezone()));
  readonly extendedHorizon = EXTENDED_HORIZON_DAYS;

  loading = signal(true);
  result = signal<TeamSuggestions | null>(null);
  horizon = signal(DEFAULT_HORIZON_DAYS);

  manualOpen = signal(false);
  loadingEligible = signal(false);
  eligible = signal<EligibleProvider[]>([]);
  selected = signal<string[]>([]);
  readonly startControl = new FormControl<Date | null>(null);
  checking = signal(false);
  compat = signal<JointCompatibilityResult | null>(null);


  ngOnInit(): void {
    this.loadSuggestions(DEFAULT_HORIZON_DAYS);
  }

  private loadSuggestions(days: number): void {
    this.loading.set(true);
    this.horizon.set(days);
    this.source().suggest(days).subscribe({
      next: res => {
        this.result.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.result.set({ eligibleCount: 0, teamSize: 0, suggestions: [] });
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('teamSchedule.loadError') });
      },
    });
  }

  extendSearch(): void {
    this.loadSuggestions(EXTENDED_HORIZON_DAYS);
  }

  chooseSuggestion(s: TeamSuggestion): void {
    this.choose.emit({ technicianIds: s.members.map(m => m.technicianUserId), startAt: s.startAt, endAt: s.endAt });
  }

  /** "Hoje · 14:00" / "Amanhã · 09:30" / "qui., 24 de setembro · 09:00" — no fuso da empresa. */
  slotLabel(s: TeamSuggestion): string {
    const lang = this.translate.getCurrentLang();
    const tz = this.tenantTimezone();
    const start = new Date(s.startAt);
    const dayKey = (d: Date) => formatLocalizedDate(d.toISOString(), 'en', 'date', tz);
    const now = new Date();
    const day = dayKey(start) === dayKey(now) ? this.translate.instant('teamSchedule.today')
      : dayKey(start) === dayKey(new Date(now.getTime() + 86_400_000)) ? this.translate.instant('teamSchedule.tomorrow')
        : formatLocalizedDate(s.startAt, lang, 'weekdayDate', tz);
    return `${day} · ${formatLocalizedDate(s.startAt, lang, 'time', tz)}`;
  }

  teamLabel(s: TeamSuggestion): string {
    return s.members.map(m => m.technicianName ?? '—').join(' + ');
  }

  // ── Escolha manual ─────────────────────────────────────────────────────────────
  openManual(): void {
    this.manualOpen.set(true);
    this.selected.set([]);
    this.compat.set(null);
    // Seed com o mesmo valor que `defaultDate` já mostra no seletor — senão "Confirmar" sem
    // tocar em nada fecha com o controlo ainda vazio (defaultDate só controla o que o
    // `p-datepicker` mostra, nunca o que ele grava no valor).
    this.startControl.reset(this.today(), { emitEvent: false });
    if (this.eligible().length) return;
    this.loadingEligible.set(true);
    this.source().eligible().subscribe({
      next: list => {
        this.eligible.set(list);
        this.loadingEligible.set(false);
      },
      error: () => {
        this.loadingEligible.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('teamSchedule.loadError') });
      },
    });
  }

  closeManual(): void {
    this.manualOpen.set(false);
    this.compat.set(null);
    this.checking.set(false);
  }

  toggle(userId: string): void {
    this.selected.update(list => list.includes(userId) ? list.filter(id => id !== userId) : [...list, userId]);
    this.recheck();
  }

  /** Só roda ao fechar o seletor (Confirmar, Enter ou clique fora) — não a cada clique no calendário. */
  applyStart(): void {
    const date = this.startControl.value;
    if (date && date.getHours() === 0 && date.getMinutes() === 0) {
      // O datepicker abre à meia-noite; sem hora escolhida assume 09:00.
      const normalized = new Date(date);
      normalized.setHours(9, 0, 0, 0);
      this.startControl.setValue(normalized, { emitEvent: false });
    }
    this.recheck();
  }

  /** Só checa com equipe (2+) E horário — antes disso não há conflito possível para mostrar. */
  private recheck(): void {
    this.compat.set(null);
    const ids = this.selected();
    const date = this.startControl.value;
    if (ids.length < 2 || !date) {
      this.checking.set(false);
      return;
    }
    this.checking.set(true);
    const start = zonedWallClockToInstant(date, this.tenantTimezone());
    this.source().check(ids, start.toISOString()).subscribe({
      next: res => {
        // Descarta resposta de uma seleção que já mudou.
        if (ids.join() !== this.selected().join() || date !== this.startControl.value) return;
        this.compat.set(res);
        this.checking.set(false);
      },
      error: () => {
        this.checking.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('teamSchedule.loadError') });
      },
    });
  }

  confirmManual(): void {
    const c = this.compat();
    if (!c?.viable) return;
    this.choose.emit({ technicianIds: this.selected(), startAt: c.start, endAt: c.end });
  }
}
