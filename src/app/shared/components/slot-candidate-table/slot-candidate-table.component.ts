import { ChangeDetectionStrategy, Component, EventEmitter, Output, computed, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { zonedNow } from '../../i18n/date-locale';

/**
 * Uma opção de horário com disponibilidade real — técnico + o que se sabe sobre encaixá-lo
 * (horário calculado, ou uma rota já existente naquele dia). {@code primaryText}/
 * {@code secondaryText} são texto já formatado/traduzido pelo consumidor: o componente não sabe
 * nada de agendamento nem de rotas, só apresenta.
 */
export interface SlotCandidate {
  technicianId: string;
  technicianLabel: string;
  primaryText: string;
  secondaryText?: string;
  disabled?: boolean;
  /** Objeto de origem (sugestão de agenda, rota do dia...) — o componente nunca olha para
   *  dentro, só devolve no {@link SlotCandidateTableComponent#choose} para o consumidor. */
  raw?: unknown;
}

interface TechnicianGroup {
  technicianId: string;
  technicianLabel: string;
  options: SlotCandidate[];
}

/**
 * Quadro de disponibilidade — extraído de order-schedule-provider-tab e quotation-edit (cada um
 * tinha a sua própria cópia da mesma `<p-table>` técnico/horário/rota), e reutilizado também pela
 * lavanderia para escolher técnico de entrega. Um técnico aparece **uma vez**, com as suas opções
 * de horário lado a lado — nunca uma linha por combinação técnico×horário, que dá a impressão de
 * técnicos duplicados quando o mesmo técnico tem várias janelas no horizonte.
 *
 * Puramente apresentacional: não chama serviço nenhum, quem monta {@link SlotCandidate}[] decide
 * a partir de que dado (sugestão de agenda, ou rota do dia já existente). Assume que a lista
 * recebida já vem ordenada pelo chamador (mais cedo primeiro, depois menor desvio — o mesmo
 * critério do quadro de disponibilidade no backend) — a primeira opção é sempre a destacada como
 * melhor.
 *
 * Quando {@link allowCustomTime} está ligado, oferece também "Escolher outra data e horário": o
 * componente centraliza o seletor de data/hora e a lista de resultados dessa busca (mesmo
 * agrupamento por técnico), mas não faz a chamada de rede — emite {@link customTimeSearch} com o
 * instante escolhido e espera do consumidor {@link customTimeCandidates}/{@link
 * customTimeSearching}/{@link customTimeSearched} de volta, exatamente como o resto do
 * componente não sabe de onde vêm os candidatos normais.
 */
@Component({
  selector: 'app-slot-candidate-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ButtonModule, DatePickerModule],
  template: `
    @if (candidates().length === 0 && !allowCustomTime()) {
      <p class="text-xs text-app-text-tertiary text-center py-4">{{ emptyMessage() }}</p>
    } @else {
      @if (candidates().length === 0) {
        <p class="text-xs text-app-text-tertiary text-center py-2">{{ emptyMessage() }}</p>
      } @else {
        <div class="space-y-3 relative">
          @for (group of groups(); track group.technicianId) {
            <div>
              <div class="text-sm font-medium text-app-text mb-1.5">{{ group.technicianLabel }}</div>
              <div class="flex flex-wrap gap-2">
                @for (option of group.options; track option.primaryText + option.secondaryText) {
                  <button type="button" class="slot-chip" [class.slot-chip-best]="option === bestCandidate()"
                          [disabled]="!!option.disabled || choosing()" (click)="choose.emit(option)">
                    @if (option === bestCandidate()) {
                      <i class="pi pi-star-fill text-[10px]"></i>
                    }
                    <span>{{ option.primaryText }}</span>
                    @if (option.secondaryText) {
                      <span class="text-app-text-tertiary">· {{ option.secondaryText }}</span>
                    }
                  </button>
                }
              </div>
            </div>
          }
          <!-- "Escolher outra data e horário" (allowCustomTime) substitui esta lista pela busca
               exata — bloqueada, não escondida, para o utilizador não perder onde estava; some de
               volta só quando ele fecha o seletor (X → closeCustomTime), nunca sozinha. -->
          @if (customTimePickerOpen()) {
            <div class="absolute inset-0 -m-1 rounded bg-app-surface/80 backdrop-blur-[1px]
                        flex items-center justify-center cursor-not-allowed">
              <i class="pi pi-lock text-app-text-tertiary"></i>
            </div>
          }
        </div>
      }

      @if (allowCustomTime()) {
        <div class="mt-3 pt-3 border-t border-app-border-subtle">
          @if (!customTimePickerOpen()) {
            <button type="button" class="text-xs text-app-accent hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                    (click)="openCustomTime()">
              <i class="pi pi-calendar-plus"></i>{{ customTimeLabel() }}
            </button>
          } @else {
            <div class="space-y-2">
              <div class="flex items-center gap-2 flex-wrap">
                <p-datepicker #dp [ngModel]="customTimeValue()" (ngModelChange)="customTimeValue.set($event)"
                              [showTime]="true" [hideOnDateTimeSelect]="false" [showButtonBar]="true"
                              hourFormat="24" dateFormat="dd/mm/yy" appendTo="body"
                              [minDate]="minDate()" [defaultDate]="defaultDateTime()"
                              [placeholder]="customTimePlaceholder()">
                  <ng-template #buttonbar let-clearCallback="clearCallback">
                    <div class="flex justify-between w-full gap-2">
                      <p-button [label]="clearLabel()" size="small" [text]="true" severity="secondary"
                                (onClick)="clearCallback($event)" />
                      <p-button [label]="confirmLabel()" size="small" (onClick)="dp.toggle()" />
                    </div>
                  </ng-template>
                </p-datepicker>
                <p-button [label]="customTimeSearchLabel()" icon="pi pi-search" size="small" [outlined]="true"
                          [disabled]="!customTimeValue()" [loading]="customTimeSearching()"
                          (onClick)="search()" />
                <p-button icon="pi pi-times" [text]="true" size="small" (onClick)="closeCustomTime()" />
              </div>

              @if (customTimeSearched()) {
                @if (customTimeCandidates().length === 0) {
                  <p class="text-xs text-app-text-tertiary py-2">{{ customTimeEmptyMessage() }}</p>
                } @else {
                  <div class="space-y-3">
                    @for (group of customTimeGroups(); track group.technicianId) {
                      <div>
                        <div class="text-sm font-medium text-app-text mb-1.5">{{ group.technicianLabel }}</div>
                        <div class="flex flex-wrap gap-2">
                          @for (option of group.options; track option.primaryText + option.secondaryText) {
                            <button type="button" class="slot-chip"
                                    [disabled]="!!option.disabled || choosing()" (click)="choose.emit(option)">
                              <span>{{ option.primaryText }}</span>
                              @if (option.secondaryText) {
                                <span class="text-app-text-tertiary">· {{ option.secondaryText }}</span>
                              }
                            </button>
                          }
                        </div>
                      </div>
                    }
                  </div>
                }
              }
            </div>
          }
        </div>
      }
    }
  `,
  styles: [`
    @reference "../../../../styles.css";
    .slot-chip {
      @apply inline-flex items-center gap-1.5 rounded-full border border-app-border bg-app-surface px-3 py-1.5
             text-xs text-app-text transition-colors cursor-pointer;
    }
    .slot-chip:hover:not(:disabled) { @apply border-app-accent bg-app-surface-hover; }
    .slot-chip:disabled { @apply opacity-40 cursor-not-allowed; }
    .slot-chip-best { @apply border-app-accent bg-app-accent/10 text-app-accent font-medium; }
  `],
})
export class SlotCandidateTableComponent {
  candidates = input<SlotCandidate[]>([]);
  emptyMessage = input('');
  choosing = input(false);

  /** Liga "Escolher outra data e horário" — só faz sentido onde o consumidor sabe montar uma
   *  nova busca a partir de um instante exato (quotation-edit, agendamento/reagendamento de
   *  ordem). Desligado por omissão: lavanderia já tem o seu próprio seletor de data acima da
   *  tabela, um por dia, não por candidato. */
  allowCustomTime = input(false);
  customTimeLabel = input('');
  customTimeSearchLabel = input('');
  customTimePlaceholder = input('');
  customTimeEmptyMessage = input('');
  minDate = input<Date | undefined>(undefined);
  /** Fuso do tenant — sem ele o `p-datepicker` sugere a hora atual do browser de quem agenda no
   *  seletor de "outra data e horário", não a hora atual do tenant. */
  tenantTimezone = input<string | null>(null);
  /** Rótulos da barra de botões do `p-datepicker` (issue: seletor fechava sozinho assim que a
   *  data era escolhida, sem dar chance de ajustar a hora — "Confirmar" fecha explicitamente,
   *  "Limpar" usa o clearCallback nativo do PrimeNG). */
  clearLabel = input('');
  confirmLabel = input('');

  /** Resultado da busca disparada por {@link customTimeSearch} — o consumidor volta a preencher
   *  estes três sinais depois de chamar o serviço, o componente só apresenta. */
  customTimeCandidates = input<SlotCandidate[]>([]);
  customTimeSearching = input(false);
  customTimeSearched = input(false);

  @Output() choose = new EventEmitter<SlotCandidate>();
  @Output() customTimeSearch = new EventEmitter<Date>();
  /** Emitido quando o X fecha o seletor — o consumidor é quem guarda os resultados da busca
   *  ({@link customTimeCandidates}/{@link customTimeSearched}), então é ele quem tem de os
   *  limpar; o componente só limpa o que é seu (o valor escolhido no `p-datepicker`). */
  @Output() customTimeClose = new EventEmitter<void>();

  customTimePickerOpen = signal(false);
  customTimeValue = signal<Date | null>(null);
  defaultDateTime = computed(() => zonedNow(this.tenantTimezone()));

  bestCandidate = computed(() => this.candidates()[0]);

  groups = computed<TechnicianGroup[]>(() => this.groupByTechnician(this.candidates()));
  customTimeGroups = computed<TechnicianGroup[]>(() => this.groupByTechnician(this.customTimeCandidates()));

  private groupByTechnician(list: SlotCandidate[]): TechnicianGroup[] {
    const groups: TechnicianGroup[] = [];
    const byId = new Map<string, TechnicianGroup>();
    for (const candidate of list) {
      let group = byId.get(candidate.technicianId);
      if (!group) {
        group = { technicianId: candidate.technicianId, technicianLabel: candidate.technicianLabel, options: [] };
        byId.set(candidate.technicianId, group);
        groups.push(group);
      }
      group.options.push(candidate);
    }
    return groups;
  }

  /** Abre já com o valor visível pré-selecionado (hoje/agora no fuso do tenant) — senão
   *  "Confirmar" sem tocar em nada fecha o seletor com `customTimeValue` ainda `null`, porque
   *  `defaultDate` só controla o que o `p-datepicker` mostra, nunca o que ele grava no ngModel. */
  openCustomTime(): void {
    this.customTimeValue.set(this.defaultDateTime());
    this.customTimePickerOpen.set(true);
  }

  search(): void {
    const value = this.customTimeValue();
    if (!value) return;
    this.customTimeSearch.emit(value);
  }

  closeCustomTime(): void {
    this.customTimePickerOpen.set(false);
    this.customTimeValue.set(null);
    this.customTimeClose.emit();
  }
}
