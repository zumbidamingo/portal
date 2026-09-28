import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';
import { Provider, ProviderService, RouteEndpoint } from '../../../core/services/provider.service';
import { AddressAutocompleteComponent, AddressValue } from '../../../shared/components/address-autocomplete/address-autocomplete.component';

/**
 * Morada de casa do técnico e as duas pontas da sua rota (issue #173).
 *
 * <p>Quando a empresa liga "toda a frota parte da sede" nos Parâmetros do Sistema, os dois
 * seletores ficam desativados e dizem-no — a preferência continua gravada, mas não é consultada,
 * e um seletor que aparenta decidir algo que não decide é exatamente o que o CLAUDE.md §17.6
 * proíbe.
 */
@Component({
  selector: 'app-provider-route-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, ButtonModule, SelectModule, MessageModule,
    AddressAutocompleteComponent],
  template: `
    <div class="space-y-5 pt-3" [formGroup]="form">
      @if (forcedByCompany()) {
        <p-message severity="info" [text]="'providers.route.forcedByCompany' | translate" styleClass="w-full" />
      }

      <app-address-autocomplete formControlName="address" label="providers.route.homeAddress"
                                placeholder="providers.route.homeAddressPlaceholder"
                                hint="providers.route.homeAddressHint" />

      <div class="mt-2">
        <label class="label">{{ 'providers.route.startPoint' | translate }}</label>
        <p-select [options]="endpointOptions" formControlName="routeStartPoint" optionLabel="label" optionValue="value"
                  appendTo="body" fluid></p-select>
      </div>
      <div>
        <label class="label">{{ 'providers.route.endPoint' | translate }}</label>
        <p-select [options]="endpointOptions" formControlName="routeEndPoint" optionLabel="label" optionValue="value"
                  appendTo="body" fluid></p-select>
        <p class="text-xs text-app-text-tertiary mt-1">{{ 'providers.route.endPointHint' | translate }}</p>
      </div>

      @if (needsGeocodedAddress()) {
        <p-message severity="warn" [text]="'providers.route.needsGeocodedAddress' | translate" styleClass="w-full" />
      }

      @if (canWrite()) {
        <div class="flex justify-end">
          <p-button [label]="'common.save' | translate" icon="pi pi-check" [loading]="saving()"
                    [disabled]="needsGeocodedAddress()" (onClick)="save()"></p-button>
        </div>
      }
    </div>
  `,
  styles: [`
    @reference "../../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
  `],
})
export class ProviderRouteTabComponent {
  provider = input.required<Provider>();
  canWrite = input(false);
  /** Vem dos Parâmetros do Sistema — quando ligado, a preferência do técnico não é consultada. */
  forcedByCompany = input(false);
  providerUpdated = output<Provider>();

  private providerService = inject(ProviderService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  saving = signal(false);

  readonly endpointOptions: { label: string; value: RouteEndpoint }[] = [
    { label: this.translate.instant('providers.route.endpointCOMPANY'), value: 'COMPANY' },
    { label: this.translate.instant('providers.route.endpointHOME'), value: 'HOME' },
  ];

  readonly form = new FormGroup({
    address: new FormControl<AddressValue | null>(null),
    routeStartPoint: new FormControl<RouteEndpoint>('COMPANY', { nonNullable: true }),
    routeEndPoint: new FormControl<RouteEndpoint>('COMPANY', { nonNullable: true }),
  });

  private loadedForId: string | null = null;

  constructor() {
    effect(() => {
      const p = this.provider();
      if (this.loadedForId === p.id) return;
      this.loadedForId = p.id;
      this.form.reset({
        address: p.address
          ? {
              street: p.address,
              complement: p.addressComplement ?? undefined,
              city: p.city ?? undefined,
              country: p.country ?? undefined,
              postalCode: p.postalCode ?? undefined,
              latitude: p.latitude ?? undefined,
              longitude: p.longitude ?? undefined,
            }
          : null,
        routeStartPoint: p.routeStartPoint,
        routeEndPoint: p.routeEndPoint,
      });
    });

    // Com a empresa a forçar a sede, a escolha do técnico não é consultada — desativar é mais
    // honesto do que deixar mexer num campo sem efeito.
    effect(() => {
      const disabled = this.forcedByCompany() || !this.canWrite();
      const method = disabled ? 'disable' : 'enable';
      this.form.controls.routeStartPoint[method]({ emitEvent: false });
      this.form.controls.routeEndPoint[method]({ emitEvent: false });
    });
  }

  /** Escolher casa sem uma morada localizável deixa a rota sem ponto de partida — o backend
   *  recusa, e é melhor dizê-lo aqui do que na hora de planear. */
  needsGeocodedAddress(): boolean {
    const v = this.form.getRawValue();
    const usesHome = v.routeStartPoint === 'HOME' || v.routeEndPoint === 'HOME';
    return usesHome && (v.address?.latitude == null || v.address?.longitude == null);
  }

  save(): void {
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.providerService
      .setRouteSettings(this.provider().id, {
        address: v.address?.street ?? null,
        addressComplement: v.address?.complement ?? null,
        city: v.address?.city ?? null,
        country: v.address?.country ?? null,
        postalCode: v.address?.postalCode ?? null,
        latitude: v.address?.latitude ?? null,
        longitude: v.address?.longitude ?? null,
        routeStartPoint: v.routeStartPoint,
        routeEndPoint: v.routeEndPoint,
      })
      .subscribe({
        next: updated => {
          this.saving.set(false);
          this.providerUpdated.emit(updated);
          this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.route.saved') });
        },
        error: () => {
          this.saving.set(false);
          this.messageService.add({ severity: 'error', summary: this.translate.instant('providers.route.saveError') });
        },
      });
  }
}
