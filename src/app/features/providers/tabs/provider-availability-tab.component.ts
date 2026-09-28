import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';
import { DatePickerModule } from 'primeng/datepicker';
import { ConfirmationService, MessageService } from 'primeng/api';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { AbsenceType, LunchBreak, Provider, ProviderAbsenceSummary, ProviderService, WeeklyAvailability } from '../../../core/services/provider.service';
import { TagBadgeComponent } from '../../../shared/components/tag-badge/tag-badge.component';
import { ProviderAbsencesManageDialogComponent } from './provider-absences-manage-dialog.component';

const DAYS: string[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

interface DayColumn {
  day: string;
  slots: WeeklyAvailability[];
  lunch: LunchBreak[];
}

interface LunchDayColumn {
  day: string;
  lunch: LunchBreak[];
}

interface AvailabilityPreset {
  labelKey: string;
  days: string[];
  start: [number, number];
  end: [number, number];
}

/** Padrões comuns de disponibilidade — preenchem a configuração rápida para o utilizador
 *  revisar/ajustar antes de aplicar, não aplicam sozinhos. */
const AVAILABILITY_PRESETS: AvailabilityPreset[] = [
  { labelKey: 'providers.presets.weekdaysFull', days: WEEKDAYS, start: [8, 0], end: [18, 0] },
  { labelKey: 'providers.presets.weekdaysMorning', days: WEEKDAYS, start: [8, 0], end: [12, 0] },
  { labelKey: 'providers.presets.weekdaysAfternoon', days: WEEKDAYS, start: [13, 0], end: [18, 0] },
  { labelKey: 'providers.presets.weekdaysPlusSaturday', days: [...WEEKDAYS, 'SATURDAY'], start: [8, 0], end: [18, 0] },
  { labelKey: 'providers.presets.everyDay', days: DAYS, start: [8, 0], end: [18, 0] },
];

/** Padrões comuns de almoço — mesmo princípio de {@link AVAILABILITY_PRESETS}: só preenchem a
 *  configuração rápida, o utilizador ainda revê/ajusta e clica "Aplicar". */
const LUNCH_BREAK_PRESETS: AvailabilityPreset[] = [
  { labelKey: 'providers.lunchPresets.weekdaysNoon', days: WEEKDAYS, start: [12, 0], end: [13, 0] },
  { labelKey: 'providers.lunchPresets.weekdaysNoonNinety', days: WEEKDAYS, start: [12, 0], end: [13, 30] },
  { labelKey: 'providers.lunchPresets.weekdaysOneTwelve', days: WEEKDAYS, start: [12, 0], end: [13, 12] },
  { labelKey: 'providers.lunchPresets.weekdaysOnePm', days: WEEKDAYS, start: [13, 0], end: [14, 0] },
  { labelKey: 'providers.lunchPresets.weekdaysPlusSaturdayNoon', days: [...WEEKDAYS, 'SATURDAY'], start: [12, 0], end: [13, 0] },
  { labelKey: 'providers.lunchPresets.everyDayNoon', days: DAYS, start: [12, 0], end: [13, 0] },
];

/**
 * Disponibilidade semanal + exceções. Toda a orquestração de "aplicar a vários dias", "copiar
 * dia" e "editar slot" é feita no cliente sobre os 2 endpoints existentes (add/remove) — dias
 * diferentes nunca colidem no backend (overlap é sempre por dia), e "editar" é remove+add do
 * mesmo dia. Nenhum endpoint novo foi necessário.
 */
@Component({
  selector: 'app-provider-availability-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslatePipe, ButtonModule, SelectButtonModule, DatePickerModule,
    TagBadgeComponent, ProviderAbsencesManageDialogComponent],
  template: `
    <div class="space-y-5 pt-3">
      @if (weeklyRows().length === 0) {
        <p class="text-sm text-app-warning flex items-center gap-1.5">
          <i class="pi pi-exclamation-triangle"></i>{{ 'providers.noWeeklyWarning' | translate }}
        </p>
      }
      <p class="text-xs text-app-text-tertiary">{{ 'providers.availabilityImpactHint' | translate }}</p>

      <!-- Configuração rápida -->
      <div class="space-y-3">
        <h4 class="text-xs font-semibold text-app-text-secondary uppercase tracking-wide">
          {{ 'providers.quickSetup' | translate }}
        </h4>
        @if (canWrite()) {
          <div>
            <label class="label">{{ 'providers.presetsLabel' | translate }}</label>
            <div class="flex flex-wrap gap-1.5">
              @for (preset of presets; track preset.labelKey) {
                <p-button [label]="preset.labelKey | translate" [outlined]="true" size="small"
                          (onClick)="applyPreset(preset)"></p-button>
              }
            </div>
          </div>
        }
        <div>
          <label class="label">{{ 'providers.selectDays' | translate }}</label>
          <p-selectbutton [options]="dayOptions" [multiple]="true" optionLabel="label" optionValue="value"
                          [ngModel]="quickDays()" (ngModelChange)="quickDays.set($event)" [disabled]="!canWrite()"></p-selectbutton>
        </div>
        <div class="flex flex-wrap gap-2 items-end">
          <div>
            <label class="label">{{ 'providers.startTime' | translate }}</label>
            <p-datepicker [ngModel]="quickStart()" (ngModelChange)="quickStart.set($event)" timeOnly hourFormat="24"
                          appendTo="body" [disabled]="!canWrite()"></p-datepicker>
          </div>
          <div>
            <label class="label">{{ 'providers.endTime' | translate }}</label>
            <p-datepicker [ngModel]="quickEnd()" (ngModelChange)="quickEnd.set($event)" timeOnly hourFormat="24"
                          appendTo="body" [disabled]="!canWrite()"></p-datepicker>
          </div>
          @if (canWrite()) {
            <p-button [label]="'providers.apply' | translate" icon="pi pi-check" [loading]="quickApplying()"
                      [disabled]="quickDays().length === 0 || !quickStart() || !quickEnd()" (onClick)="applyQuick()"></p-button>
          }
        </div>
      </div>

      <!-- Grade semanal -->
      <div>
        <h4 class="text-xs font-semibold text-app-text-secondary uppercase tracking-wide mb-2">
          {{ 'providers.weekGrid' | translate }}
        </h4>
        <div class="flex gap-2 overflow-x-auto pb-1">
          @for (col of weekGrid(); track col.day) {
            <div class="min-w-[128px] border border-app-border rounded-lg p-2 space-y-1.5 flex-shrink-0">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-app-text">{{ ('providers.day' + col.day) | translate }}</span>
                @if (canWrite() && col.slots.length > 0) {
                  <span class="flex items-center gap-0.5">
                    <button type="button" class="text-app-text-tertiary hover:text-app-accent" [title]="'providers.copyTo' | translate"
                            (click)="startCopy(col.day)">
                      <i class="pi pi-copy" style="font-size:11px"></i>
                    </button>
                    <button type="button" class="text-app-text-tertiary hover:text-app-danger" [title]="'providers.clearDay' | translate"
                            (click)="confirmClearDay(col.day)">
                      <i class="pi pi-trash" style="font-size:11px"></i>
                    </button>
                  </span>
                }
              </div>
              @if (col.slots.length === 0) {
                <p class="text-xs text-app-text-tertiary">{{ 'providers.unavailableDay' | translate }}</p>
              } @else {
                <div class="space-y-1">
                  @for (slot of col.slots; track slot.id) {
                    @if (editingSlotId() === slot.id) {
                      <div class="flex flex-col gap-1 border border-app-accent rounded p-1">
                        <p-datepicker [ngModel]="editStart()" (ngModelChange)="editStart.set($event)" timeOnly hourFormat="24" appendTo="body" styleClass="w-full"></p-datepicker>
                        <p-datepicker [ngModel]="editEnd()" (ngModelChange)="editEnd.set($event)" timeOnly hourFormat="24" appendTo="body" styleClass="w-full"></p-datepicker>
                        <div class="flex justify-end gap-1">
                          <button type="button" class="text-app-text-tertiary" (click)="cancelEdit()"><i class="pi pi-times" style="font-size:11px"></i></button>
                          <button type="button" class="text-app-accent" [disabled]="savingEdit()" (click)="saveEdit(slot)"><i class="pi pi-check" style="font-size:11px"></i></button>
                        </div>
                      </div>
                    } @else {
                      <div class="flex items-center justify-between text-xs bg-app-accent-soft rounded px-1.5 py-1 gap-1">
                        <span>{{ slot.startTime.slice(0,5) }}–{{ slot.endTime.slice(0,5) }}</span>
                        @if (canWrite()) {
                          <span class="flex items-center gap-1 shrink-0">
                            <button type="button" (click)="startEdit(slot)"><i class="pi pi-pencil" style="font-size:10px"></i></button>
                            <button type="button" (click)="confirmRemoveWeekly(slot)"><i class="pi pi-times" style="font-size:10px"></i></button>
                          </span>
                        }
                      </div>
                    }
                  }
                  @for (lunch of col.lunch; track lunch.id) {
                    <div class="flex items-center justify-between text-xs bg-app-warning-soft text-app-warning rounded px-1.5 py-1 gap-1">
                      <span class="flex items-center gap-1">
                        <i class="pi pi-sun" style="font-size:10px"></i>
                        {{ lunch.startTime.slice(0,5) }}–{{ lunch.endTime.slice(0,5) }} — {{ 'providers.lunchBreakShort' | translate }}
                      </span>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>

        @if (copyingFromDay(); as sourceDay) {
          <div class="mt-2 border border-app-accent rounded-lg p-3 space-y-2">
            <p class="text-xs text-app-text">
              {{ 'providers.copyFromTo' | translate:{ day: ('providers.day' + sourceDay) | translate } }}
            </p>
            <p-selectbutton [options]="copyTargetOptions(sourceDay)" [multiple]="true" optionLabel="label" optionValue="value"
                            [ngModel]="copyTargetDays()" (ngModelChange)="copyTargetDays.set($event)"></p-selectbutton>
            <div class="flex justify-end gap-2">
              <p-button [label]="'common.cancel' | translate" [outlined]="true" size="small" (onClick)="cancelCopy()"></p-button>
              <p-button [label]="'providers.apply' | translate" size="small" [loading]="copying()"
                        [disabled]="copyTargetDays().length === 0" (onClick)="applyCopy(sourceDay)"></p-button>
            </div>
          </div>
        }
      </div>

      <!-- Intervalo de almoço -->
      <div class="space-y-3 border-t border-app-border pt-4">
        <h4 class="text-xs font-semibold text-app-text-secondary uppercase tracking-wide">
          {{ 'providers.lunchBreakSection' | translate }}
        </h4>
        <p class="text-xs text-app-text-tertiary">{{ 'providers.lunchBreakHint' | translate }}</p>

        @if (canWrite()) {
          <div>
            <label class="label">{{ 'providers.presetsLabel' | translate }}</label>
            <div class="flex flex-wrap gap-1.5">
              @for (preset of lunchPresets; track preset.labelKey) {
                <p-button [label]="preset.labelKey | translate" [outlined]="true" size="small"
                          (onClick)="applyLunchPreset(preset)"></p-button>
              }
            </div>
          </div>
          <div class="flex flex-wrap gap-2 items-end">
            <div>
              <label class="label">{{ 'providers.selectDays' | translate }}</label>
              <p-selectbutton [options]="dayOptions" [multiple]="true" optionLabel="label" optionValue="value"
                              [ngModel]="quickLunchDays()" (ngModelChange)="quickLunchDays.set($event)"></p-selectbutton>
            </div>
            <div>
              <label class="label">{{ 'providers.startTime' | translate }}</label>
              <p-datepicker [ngModel]="quickLunchStart()" (ngModelChange)="quickLunchStart.set($event)" timeOnly hourFormat="24"
                            appendTo="body"></p-datepicker>
            </div>
            <div>
              <label class="label">{{ 'providers.endTime' | translate }}</label>
              <p-datepicker [ngModel]="quickLunchEnd()" (ngModelChange)="quickLunchEnd.set($event)" timeOnly hourFormat="24"
                            appendTo="body"></p-datepicker>
            </div>
            <p-button [label]="'providers.apply' | translate" icon="pi pi-check" [loading]="quickLunchApplying()"
                      [disabled]="quickLunchDays().length === 0 || !quickLunchStart() || !quickLunchEnd()" (onClick)="applyQuickLunch()"></p-button>
          </div>
        }

        <div class="flex gap-2 overflow-x-auto pb-1">
          @for (col of lunchWeekGrid(); track col.day) {
            <div class="min-w-[128px] border border-app-border rounded-lg p-2 space-y-1.5 flex-shrink-0">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-app-text">{{ ('providers.day' + col.day) | translate }}</span>
                @if (canWrite() && col.lunch.length > 0) {
                  <button type="button" class="text-app-text-tertiary hover:text-app-accent" [title]="'providers.copyTo' | translate"
                          (click)="startCopyLunch(col.day)">
                    <i class="pi pi-copy" style="font-size:11px"></i>
                  </button>
                }
              </div>
              @if (col.lunch.length === 0) {
                <p class="text-xs text-app-text-tertiary">{{ 'providers.noLunchBreak' | translate }}</p>
              } @else {
                <div class="space-y-1">
                  @for (lunch of col.lunch; track lunch.id) {
                    @if (editingLunchId() === lunch.id) {
                      <div class="flex flex-col gap-1 border border-app-accent rounded p-1">
                        <p-datepicker [ngModel]="editLunchStart()" (ngModelChange)="editLunchStart.set($event)" timeOnly hourFormat="24" appendTo="body" styleClass="w-full"></p-datepicker>
                        <p-datepicker [ngModel]="editLunchEnd()" (ngModelChange)="editLunchEnd.set($event)" timeOnly hourFormat="24" appendTo="body" styleClass="w-full"></p-datepicker>
                        <div class="flex justify-end gap-1">
                          <button type="button" class="text-app-text-tertiary" (click)="cancelEditLunch()"><i class="pi pi-times" style="font-size:11px"></i></button>
                          <button type="button" class="text-app-accent" [disabled]="savingLunchEdit()" (click)="saveEditLunch(lunch)"><i class="pi pi-check" style="font-size:11px"></i></button>
                        </div>
                      </div>
                    } @else {
                      <div class="flex items-center justify-between text-xs bg-app-warning-soft text-app-warning rounded px-1.5 py-1 gap-1">
                        <span>{{ lunch.startTime.slice(0,5) }}–{{ lunch.endTime.slice(0,5) }}</span>
                        @if (canWrite()) {
                          <span class="flex items-center gap-1 shrink-0">
                            <button type="button" (click)="startEditLunch(lunch)"><i class="pi pi-pencil" style="font-size:10px"></i></button>
                            <button type="button" (click)="confirmRemoveLunch(lunch)"><i class="pi pi-times" style="font-size:10px"></i></button>
                          </span>
                        }
                      </div>
                    }
                  }
                </div>
              }
            </div>
          }
        </div>

        @if (copyingLunchFromDay(); as sourceDay) {
          <div class="mt-2 border border-app-accent rounded-lg p-3 space-y-2">
            <p class="text-xs text-app-text">
              {{ 'providers.copyFromTo' | translate:{ day: ('providers.day' + sourceDay) | translate } }}
            </p>
            <p-selectbutton [options]="copyTargetOptions(sourceDay)" [multiple]="true" optionLabel="label" optionValue="value"
                            [ngModel]="copyLunchTargetDays()" (ngModelChange)="copyLunchTargetDays.set($event)"></p-selectbutton>
            <div class="flex justify-end gap-2">
              <p-button [label]="'common.cancel' | translate" [outlined]="true" size="small" (onClick)="cancelCopyLunch()"></p-button>
              <p-button [label]="'providers.apply' | translate" size="small" [loading]="copyingLunch()"
                        [disabled]="copyLunchTargetDays().length === 0" (onClick)="applyCopyLunch(sourceDay)"></p-button>
            </div>
          </div>
        }
      </div>

      <!-- Ausências -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-xs font-semibold text-app-text-secondary uppercase tracking-wide">
            {{ 'providers.absencesSection' | translate }}
          </h4>
          <p-button [label]="'providers.manageAbsences' | translate" icon="pi pi-calendar" [text]="true" size="small"
                    (onClick)="manageDialogVisible.set(true)"></p-button>
        </div>
        <p class="text-xs text-app-text-tertiary mb-3">{{ 'providers.absencesSummaryHint' | translate }}</p>

        @if (absenceRows() === null) {
          <p class="text-sm text-app-text-tertiary">{{ 'common.loading' | translate }}</p>
        } @else if (absenceRows()!.length === 0) {
          <p class="text-sm text-app-text-tertiary">{{ 'providers.noAbsencesThisWindow' | translate }}</p>
        } @else {
          <ul class="space-y-1">
            @for (a of absenceRows()!; track a.type + a.sourceId + a.startDate) {
              <li class="flex items-center gap-2 text-sm border border-app-border rounded px-3 py-2">
                <app-tag-badge [value]="('providers.absenceType' + a.type) | translate" [severity]="absenceSeverity(a.type)"></app-tag-badge>
                <span>{{ a.startDate === a.endDate ? a.startDate : (a.startDate + ' → ' + a.endDate) }}@if (a.reason) { — {{ a.reason }} }</span>
              </li>
            }
          </ul>
        }
      </div>
    </div>

    <app-provider-absences-manage-dialog [provider]="provider()" [canWrite]="canWrite()" [(visible)]="manageDialogVisible"></app-provider-absences-manage-dialog>
  `,
  styles: [`
    @reference "../../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
  `],
})
export class ProviderAvailabilityTabComponent {
  provider = input.required<Provider>();
  canWrite = input(false);
  providerUpdated = output<Provider>();

  private providerService = inject(ProviderService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private translate = inject(TranslateService);

  private loadedForId: string | null = null;

  weeklyRows = signal<WeeklyAvailability[]>([]);
  lunchRows = signal<LunchBreak[]>([]);
  absenceRows = signal<ProviderAbsenceSummary[] | null>(null);
  manageDialogVisible = signal(false);

  readonly dayOptions = DAYS.map(d => ({ label: this.translate.instant('providers.day' + d).slice(0, 3), value: d }));
  readonly presets = AVAILABILITY_PRESETS;
  readonly lunchPresets = LUNCH_BREAK_PRESETS;

  quickDays = signal<string[]>([]);
  quickStart = signal<Date | null>(null);
  quickEnd = signal<Date | null>(null);
  quickApplying = signal(false);

  editingSlotId = signal<string | null>(null);
  editStart = signal<Date | null>(null);
  editEnd = signal<Date | null>(null);
  savingEdit = signal(false);

  copyingFromDay = signal<string | null>(null);
  copyTargetDays = signal<string[]>([]);
  copying = signal(false);

  quickLunchDays = signal<string[]>([]);
  quickLunchStart = signal<Date | null>(null);
  quickLunchEnd = signal<Date | null>(null);
  quickLunchApplying = signal(false);

  editingLunchId = signal<string | null>(null);
  editLunchStart = signal<Date | null>(null);
  editLunchEnd = signal<Date | null>(null);
  savingLunchEdit = signal(false);

  copyingLunchFromDay = signal<string | null>(null);
  copyLunchTargetDays = signal<string[]>([]);
  copyingLunch = signal(false);

  private wasManagingAbsences = false;

  weekGrid = computed<DayColumn[]>(() => {
    const rows = this.weeklyRows();
    const lunch = this.lunchRows();
    return DAYS.map(day => ({
      day,
      slots: rows.filter(w => w.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime)),
      lunch: lunch.filter(l => l.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }));
  });

  lunchWeekGrid = computed<LunchDayColumn[]>(() => {
    const rows = this.lunchRows();
    return DAYS.map(day => ({
      day,
      lunch: rows.filter(l => l.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }));
  });

  constructor() {
    effect(() => {
      const id = this.provider().id;
      if (this.loadedForId === id) return;
      this.loadedForId = id;
      this.reloadWeekly();
      this.reloadLunch();
      this.reloadAbsences();
    });
    /** A gestão completa (Dialog) é quem cria/edita/remove ausências — ao fechar, o resumo
     *  compacto desta aba pode estar desatualizado, por isso recarrega nesse momento. */
    effect(() => {
      const open = this.manageDialogVisible();
      if (!open && this.wasManagingAbsences) {
        this.reloadAbsences();
      }
      this.wasManagingAbsences = open;
    });
  }

  absenceSeverity(type: AbsenceType): 'warn' | 'info' | 'success' {
    if (type === 'SINGLE') return 'warn';
    if (type === 'RECURRING') return 'info';
    return 'success';
  }

  copyTargetOptions(sourceDay: string) {
    return this.dayOptions.filter(o => o.value !== sourceDay);
  }

  /** Emite {@link providerUpdated} com `hasWeeklyAvailability` recalculado — endpoints de
   *  disponibilidade semanal devolvem só o slot, nunca o Provider inteiro, e sem isto o
   *  badge "incompleto" na lista/drawer fica desatualizado até um reload manual da página. */
  private reloadWeekly(): void {
    this.providerService.listWeekly(this.provider().id).subscribe({
      next: rows => {
        this.weeklyRows.set(rows);
        this.providerUpdated.emit({ ...this.provider(), hasWeeklyAvailability: rows.length > 0 });
      },
      error: () => {},
    });
  }

  private reloadLunch(): void {
    this.providerService.listLunchBreaks(this.provider().id).subscribe({
      next: rows => this.lunchRows.set(rows),
      error: () => {},
    });
  }

  /** Mês corrente + próximo — histórico e futuro além disso ficam na gestão completa (Dialog),
   *  nunca varridos aqui (CLAUDE.md: tela principal só mostra o que é operacionalmente relevante). */
  private reloadAbsences(): void {
    const now = new Date();
    const from = this.toDateString(new Date(now.getFullYear(), now.getMonth(), 1));
    const to = this.toDateString(new Date(now.getFullYear(), now.getMonth() + 2, 0));
    this.providerService.listAbsences(this.provider().id, from, to).subscribe({
      next: rows => this.absenceRows.set(rows),
      error: () => this.absenceRows.set([]),
    });
  }

  private toTimeString(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
  }

  private toDateString(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Aplica o mesmo horário a vários dias numa única operação — dias diferentes nunca colidem
   *  no backend, por isso os pedidos podem ir em paralelo com segurança. */
  private applyToDays(days: string[], startTime: string, endTime: string, onDone: () => void): void {
    const requests = days.map(day =>
      this.providerService.addWeekly(this.provider().id, { dayOfWeek: day, startTime, endTime }).pipe(
        map(() => ({ day, ok: true as const })),
        catchError(() => of({ day, ok: false as const })),
      ));
    forkJoin(requests).subscribe(results => {
      onDone();
      this.reloadWeekly();
      const failed = results.filter(r => !r.ok);
      if (failed.length === 0) {
        this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.applySuccess') });
      } else {
        const failedDays = failed.map(f => this.translate.instant('providers.day' + f.day)).join(', ');
        this.messageService.add({
          severity: 'warn',
          summary: this.translate.instant('providers.applyResultPartial', { ok: results.length - failed.length, failed: failedDays }),
        });
      }
    });
  }

  /** Só preenche a configuração rápida — não aplica sozinho, o utilizador revê/ajusta e clica
   *  "Aplicar" como faria preenchendo à mão. */
  applyPreset(preset: AvailabilityPreset): void {
    if (!this.canWrite()) return;
    const start = new Date();
    start.setHours(preset.start[0], preset.start[1], 0, 0);
    const end = new Date();
    end.setHours(preset.end[0], preset.end[1], 0, 0);
    this.quickDays.set([...preset.days]);
    this.quickStart.set(start);
    this.quickEnd.set(end);
  }

  /** Só preenche a configuração rápida do almoço — mesmo comportamento de {@link applyPreset}. */
  applyLunchPreset(preset: AvailabilityPreset): void {
    if (!this.canWrite()) return;
    const start = new Date();
    start.setHours(preset.start[0], preset.start[1], 0, 0);
    const end = new Date();
    end.setHours(preset.end[0], preset.end[1], 0, 0);
    this.quickLunchDays.set([...preset.days]);
    this.quickLunchStart.set(start);
    this.quickLunchEnd.set(end);
  }

  applyQuick(): void {
    const days = this.quickDays();
    const start = this.quickStart();
    const end = this.quickEnd();
    if (days.length === 0 || !start || !end) return;
    this.quickApplying.set(true);
    this.applyToDays(days, this.toTimeString(start), this.toTimeString(end), () => {
      this.quickApplying.set(false);
      this.quickDays.set([]);
      this.quickStart.set(null);
      this.quickEnd.set(null);
    });
  }

  startCopy(day: string): void {
    this.copyingFromDay.set(day);
    this.copyTargetDays.set([]);
  }

  cancelCopy(): void {
    this.copyingFromDay.set(null);
    this.copyTargetDays.set([]);
  }

  applyCopy(sourceDay: string): void {
    const targets = this.copyTargetDays();
    const sourceSlots = this.weeklyRows().filter(w => w.dayOfWeek === sourceDay);
    if (targets.length === 0 || sourceSlots.length === 0) return;
    this.copying.set(true);
    // Copiar substitui o dia de destino: o horário de origem vira o do destino, em vez de colidir
    // com o que já existe lá (PROVIDER_SCHEDULE_OVERLAP).
    const existing = this.weeklyRows();
    const requests = targets.map(day => {
      const removals = existing.filter(r => r.dayOfWeek === day)
        .map(r => this.providerService.removeWeekly(this.provider().id, r.id));
      return (removals.length ? forkJoin(removals) : of([])).pipe(
        switchMap(() => forkJoin(sourceSlots.map(slot => this.providerService.addWeekly(
          this.provider().id, { dayOfWeek: day, startTime: slot.startTime, endTime: slot.endTime })))),
        map(() => ({ day, ok: true as const })),
        catchError(() => of({ day, ok: false as const })),
      );
    });
    forkJoin(requests).subscribe(results => {
      this.copying.set(false);
      this.cancelCopy();
      this.reloadWeekly();
      const failed = results.filter(r => !r.ok);
      if (failed.length === 0) {
        this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.applySuccess') });
      } else {
        const failedDays = [...new Set(failed.map(f => this.translate.instant('providers.day' + f.day)))].join(', ');
        this.messageService.add({
          severity: 'warn',
          summary: this.translate.instant('providers.applyResultPartial', { ok: results.length - failed.length, failed: failedDays }),
        });
      }
    });
  }

  startEdit(slot: WeeklyAvailability): void {
    this.editingSlotId.set(slot.id);
    const [sh, sm] = slot.startTime.split(':').map(Number);
    const [eh, em] = slot.endTime.split(':').map(Number);
    const start = new Date(); start.setHours(sh, sm, 0, 0);
    const end = new Date(); end.setHours(eh, em, 0, 0);
    this.editStart.set(start);
    this.editEnd.set(end);
  }

  cancelEdit(): void {
    this.editingSlotId.set(null);
  }

  /** Sem endpoint de update: "editar" é remove + add do mesmo dia. Se o add falhar (overlap com
   *  outro slot do dia), o slot antigo já foi removido — trade-off aceito para não criar um
   *  endpoint novo só para este caso; o erro fica visível e o utilizador tenta de novo. */
  saveEdit(slot: WeeklyAvailability): void {
    const start = this.editStart();
    const end = this.editEnd();
    if (!start || !end) return;
    this.savingEdit.set(true);
    this.providerService.removeWeekly(this.provider().id, slot.id).subscribe({
      next: () => {
        this.providerService.addWeekly(this.provider().id, {
          dayOfWeek: slot.dayOfWeek, startTime: this.toTimeString(start), endTime: this.toTimeString(end),
        }).subscribe({
          next: () => {
            this.savingEdit.set(false);
            this.editingSlotId.set(null);
            this.reloadWeekly();
            this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.weeklySaved') });
          },
          error: (err: HttpErrorResponse) => {
            this.savingEdit.set(false);
            this.reloadWeekly();
            this.messageService.add({ severity: 'error', summary: this.businessError(err, 'providers.weeklySaveError') });
          },
        });
      },
      error: () => {
        this.savingEdit.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('providers.weeklySaveError') });
      },
    });
  }

  confirmRemoveWeekly(slot: WeeklyAvailability): void {
    this.confirmationService.confirm({
      message: this.translate.instant('providers.removeWeeklyConfirm', {
        day: this.translate.instant('providers.day' + slot.dayOfWeek), start: slot.startTime, end: slot.endTime,
      }),
      header: this.translate.instant('providers.removeWeeklyConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.removeWeekly(slot.id),
    });
  }

  private removeWeekly(weeklyId: string): void {
    this.providerService.removeWeekly(this.provider().id, weeklyId).subscribe({
      next: () => {
        this.reloadWeekly();
        this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.weeklyRemoved') });
      },
      error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('providers.weeklySaveError') }),
    });
  }

  confirmClearDay(day: string): void {
    const slots = this.weeklyRows().filter(w => w.dayOfWeek === day);
    if (slots.length === 0) return;
    this.confirmationService.confirm({
      message: this.translate.instant('providers.clearDayConfirm', { day: this.translate.instant('providers.day' + day) }),
      header: this.translate.instant('providers.clearDay'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => {
        forkJoin(slots.map(s => this.providerService.removeWeekly(this.provider().id, s.id).pipe(catchError(() => of(null)))))
          .subscribe(() => {
            this.reloadWeekly();
            this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.clearDaySuccess') });
          });
      },
    });
  }

  /** Mesmo princípio de {@link applyToDays}: dias diferentes nunca colidem no backend (overlap é
   *  sempre por técnico×dia), então os pedidos de almoço podem ir em paralelo com segurança. */
  private applyLunchToDays(days: string[], startTime: string, endTime: string, onDone: () => void): void {
    const requests = days.map(day =>
      this.providerService.addLunchBreak(this.provider().id, { dayOfWeek: day, startTime, endTime }).pipe(
        map(() => ({ day, ok: true as const })),
        catchError(() => of({ day, ok: false as const })),
      ));
    forkJoin(requests).subscribe(results => {
      onDone();
      this.reloadLunch();
      const failed = results.filter(r => !r.ok);
      if (failed.length === 0) {
        this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.applySuccess') });
      } else {
        const failedDays = failed.map(f => this.translate.instant('providers.day' + f.day)).join(', ');
        this.messageService.add({
          severity: 'warn',
          summary: this.translate.instant('providers.applyResultPartial', { ok: results.length - failed.length, failed: failedDays }),
        });
      }
    });
  }

  applyQuickLunch(): void {
    const days = this.quickLunchDays();
    const start = this.quickLunchStart();
    const end = this.quickLunchEnd();
    if (days.length === 0 || !start || !end) return;
    this.quickLunchApplying.set(true);
    this.applyLunchToDays(days, this.toTimeString(start), this.toTimeString(end), () => {
      this.quickLunchApplying.set(false);
      this.quickLunchDays.set([]);
      this.quickLunchStart.set(null);
      this.quickLunchEnd.set(null);
    });
  }

  startCopyLunch(day: string): void {
    this.copyingLunchFromDay.set(day);
    this.copyLunchTargetDays.set([]);
  }

  cancelCopyLunch(): void {
    this.copyingLunchFromDay.set(null);
    this.copyLunchTargetDays.set([]);
  }

  applyCopyLunch(sourceDay: string): void {
    const targets = this.copyLunchTargetDays();
    const sourceSlots = this.lunchRows().filter(l => l.dayOfWeek === sourceDay);
    if (targets.length === 0 || sourceSlots.length === 0) return;
    this.copyingLunch.set(true);
    // Copiar substitui o dia de destino: o horário de origem vira o do destino, em vez de colidir
    // com o que já existe lá (PROVIDER_SCHEDULE_OVERLAP).
    const existing = this.lunchRows();
    const requests = targets.map(day => {
      const removals = existing.filter(r => r.dayOfWeek === day)
        .map(r => this.providerService.removeLunchBreak(this.provider().id, r.id));
      return (removals.length ? forkJoin(removals) : of([])).pipe(
        switchMap(() => forkJoin(sourceSlots.map(slot => this.providerService.addLunchBreak(
          this.provider().id, { dayOfWeek: day, startTime: slot.startTime, endTime: slot.endTime })))),
        map(() => ({ day, ok: true as const })),
        catchError(() => of({ day, ok: false as const })),
      );
    });
    forkJoin(requests).subscribe(results => {
      this.copyingLunch.set(false);
      this.cancelCopyLunch();
      this.reloadLunch();
      const failed = results.filter(r => !r.ok);
      if (failed.length === 0) {
        this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.applySuccess') });
      } else {
        const failedDays = [...new Set(failed.map(f => this.translate.instant('providers.day' + f.day)))].join(', ');
        this.messageService.add({
          severity: 'warn',
          summary: this.translate.instant('providers.applyResultPartial', { ok: results.length - failed.length, failed: failedDays }),
        });
      }
    });
  }

  startEditLunch(lunch: LunchBreak): void {
    this.editingLunchId.set(lunch.id);
    const [sh, sm] = lunch.startTime.split(':').map(Number);
    const [eh, em] = lunch.endTime.split(':').map(Number);
    const start = new Date(); start.setHours(sh, sm, 0, 0);
    const end = new Date(); end.setHours(eh, em, 0, 0);
    this.editLunchStart.set(start);
    this.editLunchEnd.set(end);
  }

  cancelEditLunch(): void {
    this.editingLunchId.set(null);
  }

  /** Sem endpoint de update, mesma solução de {@link saveEdit}: editar é remove + add. */
  saveEditLunch(lunch: LunchBreak): void {
    const start = this.editLunchStart();
    const end = this.editLunchEnd();
    if (!start || !end) return;
    this.savingLunchEdit.set(true);
    this.providerService.removeLunchBreak(this.provider().id, lunch.id).subscribe({
      next: () => {
        this.providerService.addLunchBreak(this.provider().id, {
          dayOfWeek: lunch.dayOfWeek, startTime: this.toTimeString(start), endTime: this.toTimeString(end),
        }).subscribe({
          next: () => {
            this.savingLunchEdit.set(false);
            this.editingLunchId.set(null);
            this.reloadLunch();
            this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.lunchBreakSaved') });
          },
          error: (err: HttpErrorResponse) => {
            this.savingLunchEdit.set(false);
            this.reloadLunch();
            this.messageService.add({ severity: 'error', summary: this.businessError(err, 'providers.lunchBreakSaveError') });
          },
        });
      },
      error: () => {
        this.savingLunchEdit.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('providers.lunchBreakSaveError') });
      },
    });
  }

  confirmRemoveLunch(lunch: LunchBreak): void {
    this.confirmationService.confirm({
      message: this.translate.instant('providers.removeLunchBreakConfirm', {
        day: this.translate.instant('providers.day' + lunch.dayOfWeek), start: lunch.startTime, end: lunch.endTime,
      }),
      header: this.translate.instant('providers.removeLunchBreakConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.removeLunch(lunch.id),
    });
  }

  private removeLunch(lunchBreakId: string): void {
    this.providerService.removeLunchBreak(this.provider().id, lunchBreakId).subscribe({
      next: () => {
        this.reloadLunch();
        this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.lunchBreakRemoved') });
      },
      error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('providers.lunchBreakSaveError') }),
    });
  }

  private businessError(err: HttpErrorResponse, fallbackKey: string): string {
    const code = (err.error as { errorCode?: string } | null)?.errorCode;
    if (err.status === 422 && code) {
      const key = `providers.errors.${code}`;
      const translated = this.translate.instant(key);
      if (translated !== key) return translated;
    }
    return this.translate.instant(fallbackKey);
  }
}
