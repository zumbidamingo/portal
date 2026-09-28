import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { DurationMinutesPipe } from '../../shared/pipes/duration-minutes.pipe';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { AddressAutocompleteComponent, AddressValue } from '../../shared/components/address-autocomplete/address-autocomplete.component';
import { RouteDto, RouteStopStatus, RouteStopType } from '../../core/services/route.service';
import { EnrichedStop, stopTypeLabelKey } from './routing-models';

const STOP_TYPE_ICONS: Record<RouteStopType, string> = {
  ONSITE: 'pi pi-wrench',
  PICKUP: 'pi pi-box',
  DROPOFF_HQ: 'pi pi-home',
  LAUNDRY_DROPOFF: 'pi pi-sign-in',
  LAUNDRY_PICKUP: 'pi pi-sign-out',
  DELIVERY: 'pi pi-send',
  CUSTOM: 'pi pi-flag',
  RETURN: 'pi pi-flag-fill',
};

/**
 * Rota de um único técnico (ponto 3 do briefing): cabeçalho com o estado da rota e ações de
 * ciclo de vida, timeline `1 → 2 → 3` das paradas já cruzadas com OS/cliente/endereço
 * (`EnrichedStop`, resolvido pelo shell). Puramente apresentacional quanto a HTTP — cada ação
 * sai como `output()`, o shell é quem chama os serviços e devolve a rota atualizada.
 */
@Component({
  selector: 'app-routing-stop-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ButtonModule, DialogModule, DrawerModule, InputNumberModule,
    InputTextModule, TagModule, TextareaModule, TranslatePipe, LocalizedDatePipe, DurationMinutesPipe,
    EmptyStateComponent, AddressAutocompleteComponent],
  template: `
    @if (loading()) {
      <div class="space-y-2">
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="h-16 rounded-md bg-app-surface-hover animate-pulse"></div>
        }
      </div>
    } @else if (!route()) {
      <app-empty-state icon="pi pi-map" [message]="'routing.stopList.notPlannedMessage' | translate: { name: technicianName() }"
                        [subtitle]="'routing.stopList.notPlannedSubtitle' | translate" />
      @if (isDispatcher()) {
        <div class="flex justify-center mt-3">
          <p-button [label]="'routing.plan' | translate" icon="pi pi-map" [loading]="planning()" (onClick)="planRoute.emit()" />
        </div>
      }
    } @else {
      <div class="space-y-3">
        <div class="border border-app-border rounded-md p-3 space-y-2.5">
          <div class="flex flex-wrap items-center gap-2">
            <p-tag [value]="('routing.status.' + route()!.status) | translate" [severity]="statusSeverity(route()!.status)" />
            @if (route()!.totalDistanceKm > 0) {
              <span class="text-xs text-app-text-secondary">{{ route()!.totalDistanceKm | number: '1.1-1' }} km</span>
            }
            @if (route()!.totalDurationMinutes > 0) {
              <span class="text-xs text-app-text-secondary">
                {{ 'routing.travelTime' | translate: { duration: (route()!.totalDurationMinutes | durationMinutes) } }}
              </span>
            }
            @if (route()!.totalRouteMinutes > 0) {
              <span class="text-xs font-medium text-app-text">
                {{ 'routing.totalRouteTime' | translate: { duration: (route()!.totalRouteMinutes | durationMinutes) } }}
              </span>
            }
            <span class="text-xs text-app-text-tertiary">
              <i class="pi" [class.pi-flag-fill]="route()!.destinationLatitude != null" [class.pi-arrow-right]="route()!.destinationLatitude == null"></i>
              {{ (route()!.destinationLatitude != null ? 'routing.closedRoute' : 'routing.openRoute') | translate }}
            </span>
          </div>

          @if (route()!.status === 'PLANNED' || route()!.status === 'IN_PROGRESS') {
            <div class="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-app-border">
              <div class="flex flex-wrap items-center gap-2">
                @if (route()!.status === 'PLANNED') {
                  <p-button [label]="'routing.start' | translate" icon="pi pi-play" size="small" (onClick)="startRoute.emit()" />
                }
                @if (route()!.status === 'IN_PROGRESS') {
                  <p-button [label]="'routing.complete' | translate" icon="pi pi-check" size="small" (onClick)="completeRoute.emit()" />
                }
                @if (isDispatcher()) {
                  <p-button [label]="'routing.adHoc.add' | translate" icon="pi pi-plus" size="small" [outlined]="true" (onClick)="openAdHocDrawer()" />
                }
              </div>
              @if (isDispatcher()) {
                <div class="flex items-center pl-2 border-l border-app-border">
                  <p-button [label]="'routing.cancel' | translate" icon="pi pi-times" size="small" [text]="true" severity="danger"
                            (onClick)="openCancelDialog()" />
                </div>
              }
            </div>
          }
        </div>

        @if (!stops().length) {
          <app-empty-state icon="pi pi-map-marker" [message]="'routing.stopList.noStops' | translate" />
        } @else {
          <div class="space-y-2">
            @for (stop of stops(); track stop.id) {
              <button type="button"
                      class="w-full flex items-start gap-3 border rounded-md p-3 text-left transition-colors cursor-pointer"
                      [class.border-app-accent]="stop.id === selectedStopId()"
                      [class.border-app-border]="stop.id !== selectedStopId()"
                      [class.bg-app-surface-hover]="stop.id === selectedStopId()"
                      (click)="selectStop.emit(stop.id)">
                <div class="flex flex-col items-center pt-0.5 shrink-0">
                  <span class="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold text-white"
                        [style.background]="stopColor(stop.status)">{{ stop.sequence + 1 }}</span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 text-sm font-medium text-app-text">
                    <i [class]="stopTypeIcon(stop)" class="text-xs text-app-text-tertiary"></i>
                    <span>{{ stopTypeLabelKey(stop) | translate }}</span>
                    @if (stop.orderNumber != null) {
                      <a class="text-app-accent-hover font-mono text-xs cursor-pointer hover:underline"
                         (click)="viewOrder.emit(stop.orderId!); $event.stopPropagation()">#{{ stop.orderNumber }}</a>
                    }
                  </div>
                  @if (stop.customerName) {
                    <div class="text-xs text-app-text truncate">{{ stop.customerName }}</div>
                  }
                  @if (stop.description) {
                    <div class="text-xs text-app-text truncate">{{ stop.description }}</div>
                  }
                  @if (stop.addressText) {
                    <div class="text-xs text-app-text-tertiary truncate">{{ stop.addressText }}</div>
                  }
                  <div class="text-xs text-app-text-tertiary mt-0.5">
                    @if (stop.stopType !== 'DROPOFF_HQ' && stop.stopType !== 'RETURN') {
                      <span class="text-app-text-secondary">{{ 'routing.attendanceWindow' | translate }}:</span>
                      {{ stop.plannedArrivalAt | localizedDate: 'time':tenantTimezone() }} – {{ stop.plannedDepartureAt | localizedDate: 'time':tenantTimezone() }}
                    }
                    @if (stop.distanceFromPreviousKm > 0) {
                      <div>{{ 'routing.travelFromPrevious' | translate }}: {{ stop.distanceFromPreviousKm | number: '1.1-1' }} km · {{ stop.durationFromPreviousMinutes }} min</div>
                    }
                  </div>
                  <p-tag [value]="('routing.stopStatus.' + stop.status) | translate" [severity]="stopSeverity(stop.status)" class="mt-1" />
                </div>
                @if (route()!.status === 'IN_PROGRESS' && stop.status !== 'COMPLETED' && stop.status !== 'SKIPPED') {
                  <div class="flex flex-col gap-1 shrink-0" (click)="$event.stopPropagation()">
                    @if (stop.status === 'PENDING') {
                      <p-button [label]="'routing.actions.enRoute' | translate" size="small" [text]="true" (onClick)="markStopEnRoute.emit(stop.id)" />
                    }
                    @if (stop.status === 'PENDING' || stop.status === 'EN_ROUTE') {
                      <p-button [label]="'routing.actions.arrived' | translate" size="small" [text]="true" (onClick)="markStopArrived.emit(stop.id)" />
                    }
                    @if (stop.status === 'ARRIVED') {
                      <p-button [label]="'routing.actions.complete' | translate" size="small" [text]="true" (onClick)="completeStop.emit(stop.id)" />
                    }
                    <p-button [label]="'routing.actions.skip' | translate" size="small" [text]="true" severity="danger" (onClick)="openSkipDialog(stop.id)" />
                  </div>
                }
              </button>
            }
          </div>
        }
      </div>
    }

    <p-drawer [(visible)]="adHocDrawerOpen" position="right" [style]="{ width: '420px' }" appendTo="body"
              [header]="'routing.adHoc.title' | translate">
      <form [formGroup]="adHocForm" class="space-y-4" (ngSubmit)="submitAdHocStop()">
        <p class="text-xs text-app-text-secondary">{{ 'routing.adHoc.hint' | translate }}</p>
        <div>
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">
            {{ 'routing.adHoc.description' | translate }} *
          </label>
          <input pInputText formControlName="description" class="w-full"
                 [placeholder]="'routing.adHoc.descriptionPlaceholder' | translate" />
        </div>
        <app-address-autocomplete formControlName="address" label="routing.adHoc.address"
                                  placeholder="routing.adHoc.addressPlaceholder" [required]="true" />
        <div>
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">
            {{ 'routing.adHoc.duration' | translate }} *
          </label>
          <p-inputNumber formControlName="estimatedDurationMinutes" [min]="0" [max]="1440" [showButtons]="true"
                         suffix=" min" styleClass="w-full" />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <p-button [label]="'common.close' | translate" [text]="true" type="button" (onClick)="adHocDrawerOpen = false" />
          <p-button [label]="'common.confirm' | translate" type="submit"
                    [loading]="addingAdHoc()" [disabled]="adHocForm.invalid || !adHocCoordinates()" />
        </div>
        @if (adHocForm.get('address')?.value && !adHocCoordinates()) {
          <p class="text-xs text-app-danger">{{ 'routing.adHoc.needsCoordinates' | translate }}</p>
        }
      </form>
    </p-drawer>

    <p-dialog [(visible)]="cancelDialogOpen" [header]="'routing.cancelTitle' | translate" [modal]="true" [style]="{ width: '420px' }" appendTo="body">
      <div class="space-y-3">
        <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'routing.cancelReasonLabel' | translate }}</label>
        <textarea pTextarea [(ngModel)]="cancelReason" [ngModelOptions]="{ standalone: true }" rows="3" class="w-full"
                  [placeholder]="'routing.cancelReasonPlaceholder' | translate"></textarea>
        <div class="flex justify-end gap-2 pt-2">
          <p-button [label]="'common.close' | translate" [text]="true" (onClick)="cancelDialogOpen = false" />
          <p-button [label]="'common.confirm' | translate" severity="danger"
                    [loading]="cancelling()" [disabled]="!cancelReason.trim()" (onClick)="submitCancel()" />
        </div>
      </div>
    </p-dialog>

    <p-dialog [(visible)]="skipDialogOpen" [header]="'routing.actions.skipTitle' | translate" [modal]="true" [style]="{ width: '420px' }" appendTo="body">
      <div class="space-y-3">
        <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'routing.actions.skipReasonLabel' | translate }}</label>
        <textarea pTextarea [(ngModel)]="skipReason" [ngModelOptions]="{ standalone: true }" rows="3" class="w-full"
                  [placeholder]="'routing.actions.skipReasonPlaceholder' | translate"></textarea>
        <div class="flex justify-end gap-2 pt-2">
          <p-button [label]="'common.close' | translate" [text]="true" (onClick)="skipDialogOpen = false" />
          <p-button [label]="'common.confirm' | translate" severity="danger"
                    [disabled]="!skipReason.trim()" (onClick)="submitSkip()" />
        </div>
      </div>
    </p-dialog>
  `,
})
export class RoutingStopListComponent {
  technicianName = input.required<string>();
  route = input<RouteDto | null>(null);
  stops = input<EnrichedStop[]>([]);
  selectedStopId = input<string | null>(null);
  tenantTimezone = input<string | null>(null);
  isDispatcher = input(false);
  loading = input(false);
  planning = input(false);
  cancelling = input(false);
  addingAdHoc = input(false);

  selectStop = output<string>();
  viewOrder = output<string>();
  planRoute = output<void>();
  startRoute = output<void>();
  completeRoute = output<void>();
  cancelRoute = output<string>();
  addAdHocStop = output<{ description: string; address: string | null; latitude: number; longitude: number; estimatedDurationMinutes: number }>();
  markStopEnRoute = output<string>();
  markStopArrived = output<string>();
  completeStop = output<string>();
  skipStop = output<{ stopId: string; reason: string }>();

  private fb = inject(FormBuilder);

  adHocDrawerOpen = false;
  adHocForm = this.fb.group({
    description: ['', [Validators.required, Validators.maxLength(500)]],
    address: [null as AddressValue | null, Validators.required],
    estimatedDurationMinutes: [30, [Validators.required, Validators.min(0)]],
  });

  cancelDialogOpen = false;
  cancelReason = '';

  skipDialogOpen = false;
  skipReason = '';
  private skipStopId: string | null = null;

  readonly stopTypeLabelKey = stopTypeLabelKey;

  stopTypeIcon(stop: Pick<EnrichedStop, 'stopType' | 'isReturnLeg'>): string {
    if (stop.stopType === 'ONSITE' && stop.isReturnLeg) return STOP_TYPE_ICONS.DELIVERY;
    return STOP_TYPE_ICONS[stop.stopType] ?? 'pi pi-map-marker';
  }

  statusSeverity(status: string): 'info' | 'success' | 'danger' | 'warn' {
    if (status === 'COMPLETED') return 'success';
    if (status === 'CANCELLED') return 'danger';
    if (status === 'IN_PROGRESS') return 'warn';
    return 'info';
  }

  stopSeverity(status: RouteStopStatus): 'info' | 'success' | 'danger' | 'warn' {
    if (status === 'COMPLETED') return 'success';
    if (status === 'SKIPPED') return 'danger';
    if (status === 'EN_ROUTE' || status === 'ARRIVED') return 'warn';
    return 'info';
  }

  stopColor(status: RouteStopStatus): string {
    const colors: Record<RouteStopStatus, string> = {
      PENDING: '#9ca3af', EN_ROUTE: '#3b82f6', ARRIVED: '#f59e0b', COMPLETED: '#22c55e', SKIPPED: '#ef4444',
    };
    return colors[status];
  }

  openAdHocDrawer(): void {
    this.adHocForm.reset({ description: '', address: null, estimatedDurationMinutes: 30 });
    this.adHocDrawerOpen = true;
  }

  adHocCoordinates(): { latitude: number; longitude: number } | null {
    const address = this.adHocForm.get('address')?.value as AddressValue | null;
    if (!address || address.latitude == null || address.longitude == null) return null;
    return { latitude: address.latitude, longitude: address.longitude };
  }

  submitAdHocStop(): void {
    const coordinates = this.adHocCoordinates();
    if (this.adHocForm.invalid || !coordinates) return;
    const address = this.adHocForm.get('address')!.value as AddressValue;
    this.addAdHocStop.emit({
      description: this.adHocForm.get('description')!.value!,
      address: [address.street, address.complement].filter(Boolean).join(', ') || null,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      estimatedDurationMinutes: this.adHocForm.get('estimatedDurationMinutes')!.value!,
    });
  }

  /** Chamado pelo shell após a paragem avulsa ser gravada com sucesso — fecha o drawer daqui,
   *  não no `submitAdHocStop`, porque o shell é quem sabe se a chamada deu certo. */
  closeAdHocDrawer(): void {
    this.adHocDrawerOpen = false;
  }

  openCancelDialog(): void {
    this.cancelReason = '';
    this.cancelDialogOpen = true;
  }

  submitCancel(): void {
    const reason = this.cancelReason.trim();
    if (!reason) return;
    this.cancelRoute.emit(reason);
  }

  closeCancelDialog(): void {
    this.cancelDialogOpen = false;
  }

  openSkipDialog(stopId: string): void {
    this.skipStopId = stopId;
    this.skipReason = '';
    this.skipDialogOpen = true;
  }

  submitSkip(): void {
    const reason = this.skipReason.trim();
    if (!reason || !this.skipStopId) return;
    this.skipStop.emit({ stopId: this.skipStopId, reason });
    this.skipDialogOpen = false;
  }
}
