import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { shiftIsoDate, todayIsoDate, toIsoDate } from './routing-date.util';

/**
 * Navegação rápida de datas de Rotas (ponto 10 do briefing): `‹ dia › Hoje` cobre o caso comum
 * sem abrir calendário nenhum; o ícone de calendário só serve para pular direto a uma data
 * distante — nunca é o caminho principal.
 */
@Component({
  selector: 'app-routing-date-nav',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ButtonModule, DatePickerModule, TranslatePipe, LocalizedDatePipe],
  template: `
    <div class="flex items-center gap-2">
      <p-button icon="pi pi-chevron-left" [text]="true" size="small"
                [ariaLabel]="'routing.dateNav.previous' | translate" (onClick)="shift(-1)" />

      <div class="min-w-[190px] text-center text-sm font-medium text-app-text capitalize select-none">
        {{ date() | localizedDate: 'weekdayDate' }}
      </div>

      <p-button icon="pi pi-chevron-right" [text]="true" size="small"
                [ariaLabel]="'routing.dateNav.next' | translate" (onClick)="shift(1)" />

      <p-button [label]="'routing.dateNav.today' | translate" size="small" [outlined]="true"
                [disabled]="isToday()" (onClick)="goToday()" />

      <p-datepicker [ngModel]="dateAsDate()" (ngModelChange)="onPick($event)" dateFormat="yy-mm-dd"
                    [showIcon]="true" size="small" appendTo="body" styleClass="w-[10.5rem]" />
    </div>
  `,
})
export class RoutingDateNavComponent {
  date = input.required<string>();
  dateChange = output<string>();

  dateAsDate = computed(() => parseIsoDate(this.date()));
  isToday = computed(() => this.date() === todayIsoDate());

  shift(days: number): void {
    this.dateChange.emit(shiftIsoDate(this.date(), days));
  }

  goToday(): void {
    this.dateChange.emit(todayIsoDate());
  }

  onPick(value: Date | null): void {
    if (!value) return;
    this.dateChange.emit(toIsoDate(value));
  }
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
