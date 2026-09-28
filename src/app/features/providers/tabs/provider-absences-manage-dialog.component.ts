import { ChangeDetectionStrategy, Component, effect, inject, input, model, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { TabsModule } from 'primeng/tabs';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ConfirmationService, MessageService } from 'primeng/api';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AvailabilityException, Provider, ProviderService, RecurringAbsence, VacationOccurrence, VacationRule,
} from '../../../core/services/provider.service';

const REASON_KEYS = ['ferias', 'ausencia', 'folga', 'consultaMedica', 'compromissoPessoal', 'feriado', 'outro'];
const DAYS: string[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

interface VacationRuleRow extends VacationRule {
  expanded: boolean;
  occurrences: VacationOccurrence[] | null;
  loadingOccurrences: boolean;
  editingYear: number | null;
  editStart: Date | null;
  editEnd: Date | null;
}

/**
 * Gestão completa de ausências — histórico e futuro sem limite de janela, ao contrário do resumo
 * "mês atual + próximo" da aba principal. Três seções independentes (pontual/recorrente/férias):
 * cada tipo tem a sua própria lista porque a "edição" de cada um é semanticamente diferente
 * (pontual: remove; recorrente: remove a regra; férias: a regra fica, só o ano muda).
 */
@Component({
  selector: 'app-provider-absences-manage-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslatePipe, ButtonModule, DrawerModule, TabsModule, DatePickerModule,
    SelectModule, InputTextModule, TextareaModule],
  template: `
    <p-drawer [(visible)]="visible" position="right" [dismissible]="true" [closeOnEscape]="true" appendTo="body"
              styleClass="w-full! sm:w-[34rem]! md:w-[48rem]!" (onShow)="onShow()">
      <ng-template #header>
        <span class="font-semibold text-app-text">{{ 'providers.manageAbsencesTitle' | translate }}</span>
      </ng-template>

      <div class="pb-4">
        <p-tabs value="single">
          <p-tablist class="sticky top-0 bg-app-surface z-10">
            <p-tab value="single">{{ 'providers.absenceTabSingle' | translate }}</p-tab>
            <p-tab value="recurring">{{ 'providers.absenceTabRecurring' | translate }}</p-tab>
            <p-tab value="vacation">{{ 'providers.absenceTabVacation' | translate }}</p-tab>
          </p-tablist>
          <p-tabpanels>

            <!-- Pontual -->
            <p-tabpanel value="single">
              <div class="space-y-3 pt-3">
                @if (canWrite()) {
                  <div class="flex gap-2 items-end flex-wrap">
                    <div>
                      <label class="label">{{ 'providers.startDate' | translate }}</label>
                      <p-datepicker [ngModel]="singleStart()" (ngModelChange)="setSingleStart($event)" dateFormat="yy-mm-dd" appendTo="body"></p-datepicker>
                    </div>
                    <div>
                      <label class="label">{{ 'providers.endDate' | translate }}</label>
                      <p-datepicker [ngModel]="singleEnd()" (ngModelChange)="singleEnd.set($event)" dateFormat="yy-mm-dd"
                                    [minDate]="singleStart() ?? undefined" appendTo="body"></p-datepicker>
                    </div>
                    <div class="flex-1 min-w-40">
                      <label class="label">{{ 'providers.reason' | translate }}</label>
                      <p-select [options]="reasonOptions" [ngModel]="singleReasonKey()" (ngModelChange)="singleReasonKey.set($event)"
                                optionLabel="label" optionValue="value" appendTo="body" fluid
                                [placeholder]="'providers.selectReason' | translate"></p-select>
                    </div>
                    <p-button icon="pi pi-plus" [loading]="savingSingle()"
                              [disabled]="!singleStart() || !singleEnd() || !singleReasonKey() || singleEnd()! < singleStart()!"
                              (onClick)="addSingle()"></p-button>
                  </div>
                  @if (singleReasonKey() === 'outro') {
                    <textarea pTextarea [ngModel]="singleCustomReason()" (ngModelChange)="singleCustomReason.set($event)"
                              rows="2" fluid [placeholder]="'providers.exceptionReasonOtherPlaceholder' | translate"></textarea>
                  }
                }

                @if (singleRows() === null) {
                  <p class="text-sm text-app-text-tertiary">{{ 'common.loading' | translate }}</p>
                } @else if (singleRows()!.length === 0) {
                  <p class="text-sm text-app-text-tertiary">{{ 'providers.noExceptions' | translate }}</p>
                } @else {
                  <ul class="space-y-1">
                    @for (e of singleRows()!; track e.id) {
                      <li class="flex items-center justify-between text-sm border border-app-border rounded px-3 py-2">
                        <span>{{ e.startDate }} → {{ e.endDate }}@if (e.reason) { — {{ e.reason }} }</span>
                        @if (canWrite()) {
                          <button type="button" (click)="removeSingle(e)" class="text-app-danger hover:opacity-70 cursor-pointer"><i class="pi pi-trash"></i></button>
                        }
                      </li>
                    }
                  </ul>
                }
              </div>
            </p-tabpanel>

            <!-- Recorrente -->
            <p-tabpanel value="recurring">
              <div class="space-y-3 pt-3">
                <p class="text-xs text-app-text-tertiary">{{ 'providers.recurringHint' | translate }}</p>
                @if (canWrite()) {
                  <div class="flex gap-2 items-end flex-wrap">
                    <div>
                      <label class="label">{{ 'providers.dayOfWeek' | translate }}</label>
                      <p-select [options]="dayOptions" [ngModel]="recurringDay()" (ngModelChange)="recurringDay.set($event)"
                                optionLabel="label" optionValue="value" appendTo="body" fluid></p-select>
                    </div>
                    <div>
                      <label class="label">{{ 'providers.frequency' | translate }}</label>
                      <p-select [options]="weekOfMonthOptions" [ngModel]="recurringWeekOfMonth()" (ngModelChange)="recurringWeekOfMonth.set($event)"
                                optionLabel="label" optionValue="value" appendTo="body" fluid></p-select>
                    </div>
                    <div>
                      <label class="label">{{ 'providers.startDate' | translate }}</label>
                      <p-datepicker [ngModel]="recurringStart()" (ngModelChange)="recurringStart.set($event)" dateFormat="yy-mm-dd" appendTo="body"></p-datepicker>
                    </div>
                    <div>
                      <label class="label">{{ 'providers.recurringEndDateOptional' | translate }}</label>
                      <p-datepicker [ngModel]="recurringEnd()" (ngModelChange)="recurringEnd.set($event)" dateFormat="yy-mm-dd"
                                    [minDate]="recurringStart() ?? undefined" appendTo="body" [showClear]="true"></p-datepicker>
                    </div>
                    <div class="flex-1 min-w-40">
                      <label class="label">{{ 'providers.reason' | translate }}</label>
                      <input pInputText fluid [ngModel]="recurringReason()" (ngModelChange)="recurringReason.set($event)" />
                    </div>
                    <p-button icon="pi pi-plus" [loading]="savingRecurring()" [disabled]="!recurringStart()" (onClick)="addRecurring()"></p-button>
                  </div>
                }

                @if (recurringRows() === null) {
                  <p class="text-sm text-app-text-tertiary">{{ 'common.loading' | translate }}</p>
                } @else if (recurringRows()!.length === 0) {
                  <p class="text-sm text-app-text-tertiary">{{ 'providers.noRecurring' | translate }}</p>
                } @else {
                  <ul class="space-y-1">
                    @for (r of recurringRows()!; track r.id) {
                      <li class="flex items-center justify-between text-sm border border-app-border rounded px-3 py-2">
                        <span>{{ recurringDescription(r) }}@if (r.reason) { — {{ r.reason }} }</span>
                        @if (canWrite()) {
                          <button type="button" (click)="removeRecurring(r)" class="text-app-danger hover:opacity-70 cursor-pointer"><i class="pi pi-trash"></i></button>
                        }
                      </li>
                    }
                  </ul>
                }
              </div>
            </p-tabpanel>

            <!-- Férias -->
            <p-tabpanel value="vacation">
              <div class="space-y-3 pt-3">
                <p class="text-xs text-app-text-tertiary">{{ 'providers.vacationHint' | translate }}</p>
                @if (canWrite()) {
                  <div class="flex gap-2 items-end flex-wrap">
                    <div class="flex-1 min-w-32">
                      <label class="label">{{ 'providers.vacationLabel' | translate }}</label>
                      <input pInputText fluid [ngModel]="vacationLabel()" (ngModelChange)="vacationLabel.set($event)" />
                    </div>
                    <div>
                      <label class="label">{{ 'providers.startMonth' | translate }}</label>
                      <p-select [options]="monthOptions" [ngModel]="vacationStartMonth()" (ngModelChange)="vacationStartMonth.set($event)"
                                optionLabel="label" optionValue="value" appendTo="body" styleClass="w-24"></p-select>
                    </div>
                    <div>
                      <label class="label">{{ 'providers.startDay' | translate }}</label>
                      <p-select [options]="monthDayOptions" [ngModel]="vacationStartDay()" (ngModelChange)="vacationStartDay.set($event)"
                                optionLabel="label" optionValue="value" appendTo="body" styleClass="w-24"></p-select>
                    </div>
                    <div>
                      <label class="label">{{ 'providers.endMonth' | translate }}</label>
                      <p-select [options]="monthOptions" [ngModel]="vacationEndMonth()" (ngModelChange)="vacationEndMonth.set($event)"
                                optionLabel="label" optionValue="value" appendTo="body" styleClass="w-24"></p-select>
                    </div>
                    <div>
                      <label class="label">{{ 'providers.endDay' | translate }}</label>
                      <p-select [options]="monthDayOptions" [ngModel]="vacationEndDay()" (ngModelChange)="vacationEndDay.set($event)"
                                optionLabel="label" optionValue="value" appendTo="body" styleClass="w-24"></p-select>
                    </div>
                    <p-button icon="pi pi-plus" [loading]="savingVacation()" (onClick)="addVacationRule()"></p-button>
                  </div>
                }

                @if (vacationRows() === null) {
                  <p class="text-sm text-app-text-tertiary">{{ 'common.loading' | translate }}</p>
                } @else if (vacationRows()!.length === 0) {
                  <p class="text-sm text-app-text-tertiary">{{ 'providers.noVacationRules' | translate }}</p>
                } @else {
                  <ul class="space-y-2">
                    @for (rule of vacationRows()!; track rule.id) {
                      <li class="border border-app-border rounded px-3 py-2 text-sm">
                        <div class="flex items-center justify-between">
                          <button type="button" class="flex items-center gap-1.5 text-left" (click)="toggleExpand(rule)">
                            <i class="pi" [class.pi-chevron-right]="!rule.expanded" [class.pi-chevron-down]="rule.expanded"></i>
                            <span>{{ vacationLabelText(rule) }} — {{ vacationRangeText(rule) }}</span>
                          </button>
                          @if (canWrite()) {
                            <button type="button" (click)="removeVacationRule(rule)" class="text-app-danger hover:opacity-70 cursor-pointer"><i class="pi pi-trash"></i></button>
                          }
                        </div>
                        @if (rule.expanded) {
                          <div class="mt-2 pl-5 space-y-1">
                            @if (rule.loadingOccurrences) {
                              <p class="text-xs text-app-text-tertiary">{{ 'common.loading' | translate }}</p>
                            } @else if (!rule.occurrences || rule.occurrences.length === 0) {
                              <p class="text-xs text-app-text-tertiary">{{ 'providers.noVacationOccurrences' | translate }}</p>
                            } @else {
                              @for (occ of rule.occurrences; track occ.id) {
                                <div class="flex items-center justify-between text-xs gap-2">
                                  @if (rule.editingYear === occ.year) {
                                    <span class="font-medium">{{ occ.year }}</span>
                                    <p-datepicker [ngModel]="rule.editStart" (ngModelChange)="rule.editStart = $event" dateFormat="yy-mm-dd" appendTo="body" styleClass="w-32"></p-datepicker>
                                    <p-datepicker [ngModel]="rule.editEnd" (ngModelChange)="rule.editEnd = $event" dateFormat="yy-mm-dd" appendTo="body" styleClass="w-32"></p-datepicker>
                                    <span class="flex gap-1">
                                      <button type="button" class="text-app-text-tertiary" (click)="cancelEditOccurrence(rule)"><i class="pi pi-times"></i></button>
                                      <button type="button" class="text-app-accent" (click)="saveOccurrence(rule, occ.year)"><i class="pi pi-check"></i></button>
                                    </span>
                                  } @else {
                                    <span>{{ occ.year }}: {{ occ.startDate }} → {{ occ.endDate }}</span>
                                    @if (canWrite()) {
                                      <button type="button" (click)="startEditOccurrence(rule, occ)" class="text-app-text-tertiary hover:text-app-accent"><i class="pi pi-pencil"></i></button>
                                    }
                                  }
                                </div>
                              }
                            }
                          </div>
                        }
                      </li>
                    }
                  </ul>
                }
              </div>
            </p-tabpanel>
          </p-tabpanels>
        </p-tabs>
      </div>
    </p-drawer>
  `,
  styles: [`
    @reference "../../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
  `],
})
export class ProviderAbsencesManageDialogComponent {
  provider = input.required<Provider>();
  canWrite = input(false);
  visible = model(false);

  private providerService = inject(ProviderService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private translate = inject(TranslateService);

  private loadedForId: string | null = null;

  readonly reasonOptions = REASON_KEYS.map(key => ({ label: this.translate.instant('providers.exceptionReasons.' + key), value: key }));
  readonly dayOptions = DAYS.map(d => ({ label: this.translate.instant('providers.day' + d), value: d }));
  readonly weekOfMonthOptions = [
    { label: this.translate.instant('providers.everyWeek'), value: null },
    { label: this.translate.instant('providers.nthWeek', { n: 1 }), value: 1 },
    { label: this.translate.instant('providers.nthWeek', { n: 2 }), value: 2 },
    { label: this.translate.instant('providers.nthWeek', { n: 3 }), value: 3 },
    { label: this.translate.instant('providers.nthWeek', { n: 4 }), value: 4 },
    { label: this.translate.instant('providers.lastWeek'), value: -1 },
  ];
  readonly monthOptions = Array.from({ length: 12 }, (_, i) => ({ label: String(i + 1).padStart(2, '0'), value: i + 1 }));
  readonly monthDayOptions = Array.from({ length: 31 }, (_, i) => ({ label: String(i + 1).padStart(2, '0'), value: i + 1 }));

  singleRows = signal<AvailabilityException[] | null>(null);
  singleStart = signal<Date | null>(null);
  singleEnd = signal<Date | null>(null);
  singleReasonKey = signal<string | null>(null);
  singleCustomReason = signal('');
  savingSingle = signal(false);

  recurringRows = signal<RecurringAbsence[] | null>(null);
  recurringDay = signal<string>(DAYS[0]);
  recurringWeekOfMonth = signal<number | null>(null);
  recurringStart = signal<Date | null>(new Date());
  recurringEnd = signal<Date | null>(null);
  recurringReason = signal('');
  savingRecurring = signal(false);

  vacationRows = signal<VacationRuleRow[] | null>(null);
  vacationLabel = signal('');
  vacationStartMonth = signal(12);
  vacationStartDay = signal(20);
  vacationEndMonth = signal(1);
  vacationEndDay = signal(5);
  savingVacation = signal(false);

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const id = this.provider().id;
      if (this.loadedForId === id) return;
      this.loadedForId = id;
      this.reloadAll();
    });
  }

  onShow(): void {
    this.loadedForId = null;
    this.reloadAll();
  }

  private reloadAll(): void {
    const id = this.provider().id;
    this.providerService.listExceptions(id).subscribe({ next: rows => this.singleRows.set(rows), error: () => this.singleRows.set([]) });
    this.providerService.listRecurring(id).subscribe({ next: rows => this.recurringRows.set(rows), error: () => this.recurringRows.set([]) });
    this.providerService.listVacationRules(id).subscribe({
      next: rows => this.vacationRows.set(rows.map(r => ({ ...r, expanded: false, occurrences: null, loadingOccurrences: false, editingYear: null, editStart: null, editEnd: null }))),
      error: () => this.vacationRows.set([]),
    });
  }

  private toDateString(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ---- Pontual ----

  setSingleStart(start: Date | null): void {
    this.singleStart.set(start);
    const end = this.singleEnd();
    if (start && end && end < start) this.singleEnd.set(null);
  }

  addSingle(): void {
    const start = this.singleStart();
    const end = this.singleEnd();
    const reasonKey = this.singleReasonKey();
    if (!start || !end || !reasonKey || end < start) return;
    const reason = reasonKey === 'outro'
      ? this.singleCustomReason().trim() || null
      : this.translate.instant('providers.exceptionReasons.' + reasonKey);
    this.savingSingle.set(true);
    this.providerService.addException(this.provider().id, { startDate: this.toDateString(start), endDate: this.toDateString(end), reason }).subscribe({
      next: () => {
        this.savingSingle.set(false);
        this.singleStart.set(null);
        this.singleEnd.set(null);
        this.singleReasonKey.set(null);
        this.singleCustomReason.set('');
        this.providerService.listExceptions(this.provider().id).subscribe({ next: rows => this.singleRows.set(rows), error: () => {} });
        this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.exceptionSaved') });
      },
      error: (err: HttpErrorResponse) => {
        this.savingSingle.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'providers.exceptionSaveError') });
      },
    });
  }

  removeSingle(e: AvailabilityException): void {
    this.confirmationService.confirm({
      message: this.translate.instant('providers.removeExceptionConfirm', { start: e.startDate, end: e.endDate }),
      header: this.translate.instant('providers.removeExceptionConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.providerService.removeException(this.provider().id, e.id).subscribe({
        next: () => {
          this.providerService.listExceptions(this.provider().id).subscribe({ next: rows => this.singleRows.set(rows), error: () => {} });
          this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.exceptionRemoved') });
        },
        error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('providers.exceptionSaveError') }),
      }),
    });
  }

  // ---- Recorrente ----

  recurringDescription(r: RecurringAbsence): string {
    const day = this.translate.instant('providers.day' + r.dayOfWeek);
    const freq = r.weekOfMonth == null
      ? this.translate.instant('providers.everyWeek')
      : r.weekOfMonth === -1 ? this.translate.instant('providers.lastWeek') : this.translate.instant('providers.nthWeek', { n: r.weekOfMonth });
    const range = r.endDate ? `${r.startDate} → ${r.endDate}` : this.translate.instant('providers.fromDate', { date: r.startDate });
    return `${freq} · ${day} (${range})`;
  }

  addRecurring(): void {
    const start = this.recurringStart();
    if (!start) return;
    this.savingRecurring.set(true);
    const end = this.recurringEnd();
    this.providerService.addRecurring(this.provider().id, {
      dayOfWeek: this.recurringDay(),
      weekOfMonth: this.recurringWeekOfMonth(),
      startDate: this.toDateString(start),
      endDate: end ? this.toDateString(end) : null,
      reason: this.recurringReason().trim() || null,
    }).subscribe({
      next: () => {
        this.savingRecurring.set(false);
        this.recurringEnd.set(null);
        this.recurringReason.set('');
        this.providerService.listRecurring(this.provider().id).subscribe({ next: rows => this.recurringRows.set(rows), error: () => {} });
        this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.recurringSaved') });
      },
      error: (err: HttpErrorResponse) => {
        this.savingRecurring.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'providers.recurringSaveError') });
      },
    });
  }

  removeRecurring(r: RecurringAbsence): void {
    this.confirmationService.confirm({
      message: this.translate.instant('providers.removeRecurringConfirm'),
      header: this.translate.instant('providers.removeRecurringConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.providerService.removeRecurring(this.provider().id, r.id).subscribe({
        next: () => {
          this.providerService.listRecurring(this.provider().id).subscribe({ next: rows => this.recurringRows.set(rows), error: () => {} });
          this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.recurringRemoved') });
        },
        error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('providers.recurringSaveError') }),
      }),
    });
  }

  // ---- Férias ----

  vacationLabelText(rule: VacationRuleRow): string {
    return rule.label ?? this.translate.instant('providers.vacationDefaultLabel');
  }

  vacationRangeText(rule: VacationRuleRow): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(rule.startDay)}/${pad(rule.startMonth)} → ${pad(rule.endDay)}/${pad(rule.endMonth)}`;
  }

  addVacationRule(): void {
    this.savingVacation.set(true);
    this.providerService.addVacationRule(this.provider().id, {
      label: this.vacationLabel().trim() || null,
      startMonth: this.vacationStartMonth(), startDay: this.vacationStartDay(),
      endMonth: this.vacationEndMonth(), endDay: this.vacationEndDay(),
    }).subscribe({
      next: () => {
        this.savingVacation.set(false);
        this.vacationLabel.set('');
        this.providerService.listVacationRules(this.provider().id).subscribe({
          next: rows => this.vacationRows.set(rows.map(r => ({ ...r, expanded: false, occurrences: null, loadingOccurrences: false, editingYear: null, editStart: null, editEnd: null }))),
          error: () => {},
        });
        this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.vacationSaved') });
      },
      error: (err: HttpErrorResponse) => {
        this.savingVacation.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'providers.vacationSaveError') });
      },
    });
  }

  removeVacationRule(rule: VacationRuleRow): void {
    this.confirmationService.confirm({
      message: this.translate.instant('providers.removeVacationConfirm', { label: this.vacationLabelText(rule) }),
      header: this.translate.instant('providers.removeVacationConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.providerService.removeVacationRule(this.provider().id, rule.id).subscribe({
        next: () => {
          this.providerService.listVacationRules(this.provider().id).subscribe({
            next: rows => this.vacationRows.set(rows.map(r => ({ ...r, expanded: false, occurrences: null, loadingOccurrences: false, editingYear: null, editStart: null, editEnd: null }))),
            error: () => {},
          });
          this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.vacationRemoved') });
        },
        error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('providers.vacationSaveError') }),
      }),
    });
  }

  toggleExpand(rule: VacationRuleRow): void {
    rule.expanded = !rule.expanded;
    if (rule.expanded && rule.occurrences === null) {
      rule.loadingOccurrences = true;
      this.providerService.listVacationOccurrences(this.provider().id, rule.id).subscribe({
        next: occurrences => { rule.occurrences = occurrences; rule.loadingOccurrences = false; this.vacationRows.update(rows => rows ? [...rows] : rows); },
        error: () => { rule.occurrences = []; rule.loadingOccurrences = false; this.vacationRows.update(rows => rows ? [...rows] : rows); },
      });
    }
  }

  startEditOccurrence(rule: VacationRuleRow, occ: VacationOccurrence): void {
    rule.editingYear = occ.year;
    rule.editStart = new Date(occ.startDate);
    rule.editEnd = new Date(occ.endDate);
    this.vacationRows.update(rows => rows ? [...rows] : rows);
  }

  cancelEditOccurrence(rule: VacationRuleRow): void {
    rule.editingYear = null;
    this.vacationRows.update(rows => rows ? [...rows] : rows);
  }

  saveOccurrence(rule: VacationRuleRow, year: number): void {
    const start = rule.editStart;
    const end = rule.editEnd;
    if (!start || !end) return;
    this.providerService.setVacationOccurrence(this.provider().id, rule.id, year, {
      startDate: this.toDateString(start), endDate: this.toDateString(end),
    }).subscribe({
      next: updated => {
        rule.occurrences = (rule.occurrences ?? []).map(o => (o.year === year ? updated : o));
        rule.editingYear = null;
        this.vacationRows.update(rows => rows ? [...rows] : rows);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.vacationSaved') });
      },
      error: (err: HttpErrorResponse) => this.messageService.add({ severity: 'error', summary: this.businessError(err, 'providers.vacationSaveError') }),
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
