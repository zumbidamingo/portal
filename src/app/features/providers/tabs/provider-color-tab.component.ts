import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { HttpErrorResponse } from '@angular/common/http';
import { Provider, ProviderColor, ProviderColorOption, ProviderService } from '../../../core/services/provider.service';
import { ProviderColorPickerComponent } from '../provider-color-picker.component';

/** Troca a cor do prestador no mapa de rotas — a própria cor atual sempre aparece disponível
 *  (o backend exclui o próprio prestador da checagem de conflito). */
@Component({
  selector: 'app-provider-color-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule, TranslatePipe, ProviderColorPickerComponent],
  template: `
    <div class="space-y-4 pt-3">
      <p class="text-xs text-app-text-tertiary">{{ 'providers.color.hint' | translate }}</p>
      <app-provider-color-picker [options]="options()" [selected]="selectedColor()"
                                  (colorSelected)="selectedColor.set($event)" />
      @if (canWrite()) {
        <div class="flex justify-end">
          <p-button [label]="'common.save' | translate" icon="pi pi-check" [loading]="saving()"
                    [disabled]="selectedColor() === provider().color" (onClick)="save()"></p-button>
        </div>
      }
    </div>
  `,
})
export class ProviderColorTabComponent {
  provider = input.required<Provider>();
  canWrite = input(false);
  providerUpdated = output<Provider>();

  private providerService = inject(ProviderService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  saving = signal(false);
  options = signal<ProviderColorOption[]>([]);
  selectedColor = signal<ProviderColor | null>(null);

  private loadedForId: string | null = null;

  constructor() {
    effect(() => {
      const p = this.provider();
      if (this.loadedForId === p.id) return;
      this.loadedForId = p.id;
      this.selectedColor.set(p.color);
      this.providerService.listColors(p.id).subscribe({
        next: options => this.options.set(options),
        error: () => {},
      });
    });
  }

  save(): void {
    const color = this.selectedColor();
    if (!color) return;
    this.saving.set(true);
    this.providerService.setColor(this.provider().id, color).subscribe({
      next: updated => {
        this.saving.set(false);
        this.providerUpdated.emit(updated);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.color.saved') });
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const code = (err.error as { errorCode?: string } | null)?.errorCode;
        const key = code ? `providers.errors.${code}` : '';
        const translated = key ? this.translate.instant(key) : '';
        this.messageService.add({
          severity: 'error',
          summary: translated && translated !== key ? translated : this.translate.instant('providers.color.saveError'),
        });
      },
    });
  }
}
