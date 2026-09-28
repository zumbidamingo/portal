import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Panel } from 'primeng/panel';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogService, ServiceCategory, ServiceCategoryService, ServiceService } from '../../../core/services/catalog.service';
import {
  ReactivationDefaultAction, RetentionService, ServiceMatchLevel, ServiceRecurrencePolicy,
} from '../../../core/services/retention.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { TagBadgeComponent } from '../../../shared/components/tag-badge/tag-badge.component';
import { TableStandardDirective } from '../../../shared/directives/table-standard.directive';

const ACTIONS: ReactivationDefaultAction[] = ['NONE', 'NOTIFY_OPERATOR', 'CREATE_TASK', 'SEND_WHATSAPP'];
const WRITE_ROLES = ['OWNER', 'ADMIN', 'COMMERCIAL'];

interface TargetOption {
  label: string;
  value: string;
}

/**
 * Configuração de recorrência (#274): por serviço ou categoria do catálogo, a cada quantos dias o
 * cliente costuma voltar e o que o sistema faz quando ele vence. Política por serviço vence a da
 * categoria (regra do domínio, ver `ServiceRecurrencePolicy`).
 */
@Component({
  selector: 'app-recurrence-policies',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslatePipe, ButtonModule, TableModule, DialogModule,
    SelectModule, SelectButtonModule, InputNumberModule, ToggleSwitchModule, TooltipModule, ToastModule,
    ConfirmDialogModule, Panel, TagBadgeComponent, PageHeaderComponent, EmptyStateComponent, TableStandardDirective],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast position="top-right"></p-toast>
    <p-confirmDialog [style]="{ width: '26rem', maxWidth: '95vw' }"></p-confirmDialog>

    <app-page-header [title]="'retention.policies.title' | translate" [description]="'retention.policies.subtitle' | translate">
      @if (canWrite() && !isEmpty()) {
        <p-button icon="pi pi-plus" [label]="'retention.policies.add' | translate" size="small" (onClick)="openCreate()" />
      }
    </app-page-header>

    @if (isEmpty()) {
      <app-empty-state icon="pi pi-refresh" [message]="'retention.policies.emptyTitle' | translate"
                        [subtitle]="'retention.policies.emptySubtitle' | translate"></app-empty-state>
      @if (canWrite()) {
        <div class="flex justify-center -mt-3">
          <p-button icon="pi pi-plus" [label]="'retention.policies.add' | translate" (onClick)="openCreate()" />
        </div>
      }
    } @else {
      <p-panel>
        <div class="overflow-x-auto">
          <p-table appTableStandard [value]="policies()" styleClass="p-datatable-sm" [loading]="loading()" [rows]="20">
            <ng-template pTemplate="header">
              <tr>
                <th>{{ 'retention.policies.columnTarget' | translate }}</th>
                <th>{{ 'retention.policies.columnInterval' | translate }}</th>
                <th>{{ 'retention.policies.columnAction' | translate }}</th>
                <th>{{ 'retention.policies.columnCooldown' | translate }}</th>
                <th>{{ 'retention.policies.columnMaxAttempts' | translate }}</th>
                <th>{{ 'common.status' | translate }}</th>
                @if (canWrite()) {
                  <th class="text-right w-28">{{ 'common.actions' | translate }}</th>
                }
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-policy>
              <tr>
                <td class="whitespace-nowrap">
                  <div class="font-medium text-app-text">{{ targetName(policy) }}</div>
                  <app-tag-badge [value]="('retention.policies.level.' + policy.matchLevel) | translate" severity="secondary"></app-tag-badge>
                </td>
                <td class="whitespace-nowrap">{{ 'retention.policies.days' | translate: { count: policy.intervalDays } }}</td>
                <td class="whitespace-nowrap">{{ ('retention.action.' + policy.defaultAction) | translate }}</td>
                <td class="whitespace-nowrap">{{ 'retention.policies.days' | translate: { count: policy.cooldownDays } }}</td>
                <td class="whitespace-nowrap">{{ policy.maxAttempts }}</td>
                <td class="whitespace-nowrap">
                  <div class="flex items-center gap-2">
                    <p-toggleswitch [ngModel]="policy.active" [ngModelOptions]="{standalone: true}" [disabled]="!canWrite()"
                                    (onChange)="toggleActive(policy, $event.checked)"></p-toggleswitch>
                    <span class="text-xs text-app-text-tertiary">{{ (policy.active ? 'common.active' : 'common.inactive') | translate }}</span>
                  </div>
                </td>
                @if (canWrite()) {
                  <td class="text-right whitespace-nowrap">
                    <p-button icon="pi pi-pencil" [text]="true" size="small" severity="secondary"
                              [pTooltip]="'common.edit' | translate" (onClick)="openEdit(policy)"></p-button>
                    <p-button icon="pi pi-trash" [text]="true" size="small" severity="danger"
                              [pTooltip]="'common.delete' | translate" (onClick)="confirmDelete(policy)"></p-button>
                  </td>
                }
              </tr>
            </ng-template>
          </p-table>
        </div>
      </p-panel>
    }

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '34rem', maxWidth: '95vw' }"
              [header]="(editing() ? 'retention.policies.editTitle' : 'retention.policies.add') | translate">
      <form class="space-y-4" [formGroup]="form" (ngSubmit)="save()">
        <p class="text-xs text-app-text-tertiary">{{ 'retention.policies.dialogIntro' | translate }}</p>
        @if (!editing()) {
          <div>
            <label class="label block mb-1">{{ 'retention.policies.levelLabel' | translate }}</label>
            <p-selectbutton [options]="levelOptions()" formControlName="matchLevel" optionLabel="label" optionValue="value"
                            [allowEmpty]="false"></p-selectbutton>
          </div>
          <div>
            <label class="label">{{ 'retention.policies.targetLabel' | translate }} *</label>
            <p-select [options]="targetOptions()" optionLabel="label" optionValue="value" formControlName="targetId"
                      [filter]="true" [placeholder]="'retention.policies.targetPlaceholder' | translate"
                      [loading]="loadingCatalog()" appendTo="body" fluid></p-select>
          </div>
        } @else {
          <div class="rounded-md border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text">
            {{ targetName(editing()!) }}
          </div>
        }
        <div>
          <label class="label">{{ 'retention.policies.columnInterval' | translate }} *</label>
          <p-inputnumber formControlName="intervalDays" [min]="1" [useGrouping]="false" suffix=" d" fluid></p-inputnumber>
          <p class="text-[11px] text-app-text-tertiary mt-1">{{ 'retention.policies.intervalHint' | translate }}</p>
        </div>
        <div>
          <label class="label">{{ 'retention.policies.columnAction' | translate }} *</label>
          <p-select [options]="actionOptions()" optionLabel="label" optionValue="value" formControlName="defaultAction"
                    appendTo="body" fluid></p-select>
          @if (form.controls.defaultAction.value === 'SEND_WHATSAPP') {
            <p class="text-[11px] text-app-text-tertiary mt-1">{{ 'retention.policies.whatsappHint' | translate }}</p>
          }
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="label">{{ 'retention.policies.columnCooldown' | translate }}</label>
            <p-inputnumber formControlName="cooldownDays" [min]="0" [useGrouping]="false" suffix=" d" fluid></p-inputnumber>
          </div>
          <div>
            <label class="label">{{ 'retention.policies.columnMaxAttempts' | translate }}</label>
            <p-inputnumber formControlName="maxAttempts" [min]="1" [useGrouping]="false" fluid></p-inputnumber>
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="dialogVisible.set(false)"></p-button>
          <p-button type="submit" [label]="'common.save' | translate" icon="pi pi-check" [loading]="saving()"
                    [disabled]="form.invalid"></p-button>
        </div>
      </form>
    </p-dialog>
  `,
})
export class RecurrencePoliciesComponent implements OnInit {
  private retentionService = inject(RetentionService);
  private serviceService = inject(ServiceService);
  private categoryService = inject(ServiceCategoryService);
  private authService = inject(AuthService);
  private translate = inject(TranslateService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);

  policies = signal<ServiceRecurrencePolicy[]>([]);
  services = signal<CatalogService[]>([]);
  categories = signal<ServiceCategory[]>([]);
  loading = signal(true);
  loadingCatalog = signal(false);
  saving = signal(false);
  dialogVisible = signal(false);
  editing = signal<ServiceRecurrencePolicy | null>(null);
  level = signal<ServiceMatchLevel>('SERVICE');

  isEmpty = computed(() => !this.loading() && this.policies().length === 0);
  canWrite = computed(() => WRITE_ROLES.includes(this.authService.userRole() ?? ''));

  levelOptions = computed(() => (['SERVICE', 'CATEGORY'] as ServiceMatchLevel[])
    .map(value => ({ value, label: this.translate.instant('retention.policies.level.' + value) })));
  actionOptions = computed(() => ACTIONS
    .map(value => ({ value, label: this.translate.instant('retention.action.' + value) })));

  /** Só oferece alvos ativos e ainda sem política ativa — o backend recusa duplicada, a UI evita a tentativa. */
  targetOptions = computed<TargetOption[]>(() => {
    const takenServices = new Set(this.policies().filter(p => p.active && p.serviceId).map(p => p.serviceId));
    const takenCategories = new Set(this.policies().filter(p => p.active && p.categoryId).map(p => p.categoryId));
    return this.level() === 'SERVICE'
      ? this.services().filter(s => s.active && !takenServices.has(s.id)).map(s => ({ label: s.name, value: s.id }))
      : this.categories().filter(c => c.active && !takenCategories.has(c.id)).map(c => ({ label: c.name, value: c.id }));
  });

  readonly form = new FormGroup({
    matchLevel: new FormControl<ServiceMatchLevel>('SERVICE', { nonNullable: true }),
    targetId: new FormControl<string | null>(null),
    intervalDays: new FormControl<number>(180, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
    defaultAction: new FormControl<ReactivationDefaultAction>('NOTIFY_OPERATOR', { nonNullable: true, validators: Validators.required }),
    cooldownDays: new FormControl<number>(30, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    maxAttempts: new FormControl<number>(3, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
  });

  ngOnInit(): void {
    this.form.controls.matchLevel.valueChanges.subscribe(level => {
      this.level.set(level);
      this.form.controls.targetId.reset(null);
    });
    this.loadPolicies();
    this.loadCatalog();
  }

  targetName(policy: ServiceRecurrencePolicy): string {
    if (policy.matchLevel === 'SERVICE') {
      return this.services().find(s => s.id === policy.serviceId)?.name ?? '—';
    }
    return this.categories().find(c => c.id === policy.categoryId)?.name ?? '—';
  }

  private loadPolicies(): void {
    this.loading.set(true);
    this.retentionService.listPolicies().subscribe({
      next: page => { this.policies.set(page.content); this.loading.set(false); },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('retention.policies.loadError') });
      },
    });
  }

  private loadCatalog(): void {
    this.loadingCatalog.set(true);
    forkJoin([
      this.serviceService.list({ size: 200, sort: 'name,asc' }),
      this.categoryService.list({ size: 200 }),
    ]).subscribe({
      next: ([services, categories]) => {
        this.services.set(services.content);
        this.categories.set(categories.content);
        this.loadingCatalog.set(false);
      },
      error: () => this.loadingCatalog.set(false),
    });
  }

  openCreate(): void {
    this.editing.set(null);
    this.level.set('SERVICE');
    this.form.reset({ matchLevel: 'SERVICE', targetId: null, intervalDays: 180, defaultAction: 'NOTIFY_OPERATOR', cooldownDays: 30, maxAttempts: 3 });
    this.form.controls.targetId.setValidators(Validators.required);
    this.form.controls.targetId.updateValueAndValidity();
    this.dialogVisible.set(true);
  }

  openEdit(policy: ServiceRecurrencePolicy): void {
    this.editing.set(policy);
    this.form.controls.targetId.clearValidators();
    this.form.controls.targetId.updateValueAndValidity();
    this.form.reset({
      matchLevel: policy.matchLevel, targetId: null, intervalDays: policy.intervalDays,
      defaultAction: policy.defaultAction, cooldownDays: policy.cooldownDays, maxAttempts: policy.maxAttempts,
    });
    this.dialogVisible.set(true);
  }

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const base = { intervalDays: v.intervalDays, defaultAction: v.defaultAction, cooldownDays: v.cooldownDays, maxAttempts: v.maxAttempts };
    const editing = this.editing();
    this.saving.set(true);
    const request$ = editing
      ? this.retentionService.updatePolicy(editing.id, base)
      : this.retentionService.createPolicy({
          ...base,
          serviceId: v.matchLevel === 'SERVICE' ? v.targetId : null,
          categoryId: v.matchLevel === 'CATEGORY' ? v.targetId : null,
        });
    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible.set(false);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('retention.policies.saved') });
        this.loadPolicies();
      },
      error: err => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'retention.policies.saveError') });
      },
    });
  }

  toggleActive(policy: ServiceRecurrencePolicy, active: boolean): void {
    this.retentionService.setPolicyActive(policy.id, active).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant(active ? 'retention.policies.activated' : 'retention.policies.deactivated', { name: this.targetName(policy) }),
        });
        this.loadPolicies();
      },
      error: err => {
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'retention.policies.saveError') });
        this.loadPolicies();
      },
    });
  }

  confirmDelete(policy: ServiceRecurrencePolicy): void {
    this.confirmationService.confirm({
      message: this.translate.instant('retention.policies.deleteConfirm', { name: this.targetName(policy) }),
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.retentionService.deletePolicy(policy.id).subscribe({
        next: () => {
          this.messageService.add({ severity: 'success', summary: this.translate.instant('retention.policies.deleted') });
          this.loadPolicies();
        },
        error: err => this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'retention.policies.deleteError') }),
      }),
    });
  }

  private errorMessage(err: unknown, fallbackKey: string): string {
    const code = (err as { error?: { errorCode?: string } })?.error?.errorCode;
    const key = code ? `retention.errors.${code}` : null;
    const translated = key ? this.translate.instant(key) : null;
    return translated && translated !== key ? translated : this.translate.instant(fallbackKey);
  }
}
