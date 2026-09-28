import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageService } from 'primeng/api';
import { Provider, ProviderService } from '../../../core/services/provider.service';

/** Teto diário de capacidade — mesmo modelo/endpoint de antes, só com explicação de impacto
 *  operacional junto a cada campo (o pedido era "entender antes de configurar"). */
@Component({
  selector: 'app-provider-capacity-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, ButtonModule, InputNumberModule],
  template: `
    <div class="space-y-5 pt-3" [formGroup]="form">
      <div>
        <label class="label">{{ 'providers.maxOrdersPerDay' | translate }}</label>
        <p-inputNumber formControlName="maxOrdersPerDay" [min]="0" fluid [placeholder]="'providers.unlimited' | translate"></p-inputNumber>
        <p class="text-xs text-app-text-tertiary mt-1">{{ 'providers.maxOrdersPerDayHint' | translate }}</p>
      </div>
      <div>
        <label class="label">{{ 'providers.maxMinutesPerDay' | translate }}</label>
        <p-inputNumber formControlName="maxMinutesPerDay" [min]="0" fluid [placeholder]="'providers.unlimited' | translate"></p-inputNumber>
        <p class="text-xs text-app-text-tertiary mt-1">{{ 'providers.maxMinutesPerDayHint' | translate }}</p>
      </div>
      <div>
        <label class="label">{{ 'providers.maxVolumePerDay' | translate }}</label>
        <p-inputNumber formControlName="maxVolumePerDay" [min]="0" [minFractionDigits]="2" fluid [placeholder]="'providers.unlimited' | translate"></p-inputNumber>
        <p class="text-xs text-app-text-tertiary mt-1">{{ 'providers.maxVolumePerDayHint' | translate }}</p>
      </div>
      @if (canWrite()) {
        <div class="flex justify-end">
          <p-button [label]="'common.save' | translate" icon="pi pi-check" [loading]="saving()" (onClick)="save()"></p-button>
        </div>
      }
    </div>
  `,
  styles: [`
    @reference "../../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
  `],
})
export class ProviderCapacityTabComponent {
  provider = input.required<Provider>();
  canWrite = input(false);
  providerUpdated = output<Provider>();

  private providerService = inject(ProviderService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  saving = signal(false);

  readonly form = new FormGroup({
    maxOrdersPerDay: new FormControl<number | null>(null),
    maxMinutesPerDay: new FormControl<number | null>(null),
    maxVolumePerDay: new FormControl<number | null>(null),
  });

  private loadedForId: string | null = null;

  constructor() {
    effect(() => {
      const p = this.provider();
      if (this.loadedForId === p.id) return;
      this.loadedForId = p.id;
      this.form.reset({ maxOrdersPerDay: p.maxOrdersPerDay, maxMinutesPerDay: p.maxMinutesPerDay, maxVolumePerDay: p.maxVolumePerDay });
    });
  }

  save(): void {
    this.saving.set(true);
    this.providerService.setCapacity(this.provider().id, this.form.getRawValue()).subscribe({
      next: updated => {
        this.saving.set(false);
        this.providerUpdated.emit(updated);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.capacitySaved') });
      },
      error: () => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('providers.capacitySaveError') });
      },
    });
  }
}
