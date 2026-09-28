import { Component, OnInit, ViewChild, inject, signal, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { Drawer, DrawerModule } from 'primeng/drawer';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { Panel } from 'primeng/panel';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth/auth.service';
import { SubscriptionService, Quota } from '../../core/services/subscription.service';
import {
  TenantUserService, TenantUser, TenantInvitation, QuotaGroup, ResetPasswordResult,
} from '../../core/services/tenant-user.service';
import { ProviderService, Provider } from '../../core/services/provider.service';
import { SkillService, Skill } from '../../core/services/catalog.service';
import { UserRole } from '../../core/models/user.model';
import { TagBadgeComponent } from '../../shared/components/tag-badge/tag-badge.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { RoleLabelPipe, translateRole } from '../../shared/pipes/role-label.pipe';
import type { BadgeSeverity } from '../../shared/utils/status.utils';
import { TableStandardDirective } from '../../shared/directives/table-standard.directive';

/**
 * Perfis que podem ser convidados por email a partir daqui — só quem tem email de verdade.
 * TECHNICIAN e LAUNDRY ficam de fora: nascem direto, com login sintético e senha padrão, cada um
 * na própria tela (Prestadores / Administração > Lavanderias — ver `CreateTechnicianUseCase`/
 * `CreateLaundryOperatorUseCase`).
 */
const INVITABLE_ROLES: { role: UserRole; group: QuotaGroup }[] = [
  { role: 'ADMIN', group: 'ADMINISTRATIVE' },
  { role: 'COMMERCIAL', group: 'ADMINISTRATIVE' },
  { role: 'OPERATOR', group: 'ADMINISTRATIVE' },
  { role: 'FINANCE', group: 'ADMINISTRATIVE' },
];

/** Grupo de quota de TODO perfil, ao contrário de `INVITABLE_ROLES` (só o que esta tela oferece
 *  pra convidar) — usado por `groupOf` pra classificar corretamente um TECHNICIAN/LAUNDRY já
 *  existente na lista, que não veio por convite. */
const ROLE_GROUP: Record<UserRole, QuotaGroup> = {
  OWNER: 'NONE', PLATFORM_ADMIN: 'NONE',
  ADMIN: 'ADMINISTRATIVE', COMMERCIAL: 'ADMINISTRATIVE', OPERATOR: 'ADMINISTRATIVE', FINANCE: 'ADMINISTRATIVE',
  TECHNICIAN: 'FIELD', LAUNDRY: 'FIELD',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type MemberStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';
/** Categoria que o Drawer/tabela mostram para quem não conhece o modelo de perfis por trás. */
type MemberCategory = 'OWNER' | 'ADMINISTRATIVE' | 'FIELD';

interface TeamRow {
  kind: 'user' | 'invitation';
  id: string;
  name: string;
  email: string;
  role: UserRole;
  category: MemberCategory;
  status: MemberStatus;
  lastLoginAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  user: TenantUser | null;
  invitation: TenantInvitation | null;
}

@Component({
  selector: 'app-tenant-users',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslatePipe, ButtonModule, InputTextModule, DialogModule,
    DrawerModule, SelectModule, TableModule, TooltipModule, ToastModule, ConfirmDialogModule, Panel,
    TagBadgeComponent, PageHeaderComponent, EmptyStateComponent, LocalizedDatePipe, RoleLabelPipe, TableStandardDirective],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast position="top-right"></p-toast>
    <p-confirmDialog></p-confirmDialog>

    <app-page-header [title]="'tenantUsers.title' | translate" [description]="'tenantUsers.subtitle' | translate"
                     [breadcrumb]="[{ label: 'nav.administration' | translate, route: '/administration' }]">
      <span [pTooltip]="bothAtLimit() ? ('tenantUsers.inviteBothLimitsTooltip' | translate) : ''"
            tooltipPosition="left" class="inline-flex">
        <p-button [label]="'tenantUsers.invite' | translate" icon="pi pi-user-plus" size="small"
                  [disabled]="bothAtLimit()" (onClick)="openInviteDialog()"></p-button>
      </span>
    </app-page-header>

    <div class="space-y-6">
      <!-- Consumo dos dois tetos, sempre em separado -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-5xl">
        <div class="bg-app-surface rounded-lg p-4">
          <div class="flex items-center gap-2 text-app-text-tertiary text-xs mb-1">
            <i class="pi pi-user" aria-hidden="true"></i>
            {{ 'subscription.usage.adminUsers' | translate }}
          </div>
          <p class="text-lg font-medium text-app-text">
            {{ adminQuota().used }}
            <span class="text-sm font-normal text-app-text-tertiary">
              / {{ adminQuota().limit === -1 ? ('subscription.usage.unlimited' | translate) : adminQuota().limit }}
            </span>
          </p>
        </div>
        <div class="bg-app-surface rounded-lg p-4">
          <div class="flex items-center gap-2 text-app-text-tertiary text-xs mb-1">
            <i class="pi pi-users" aria-hidden="true"></i>
            {{ 'subscription.usage.fieldUsers' | translate }}
          </div>
          <p class="text-lg font-medium text-app-text">
            {{ fieldQuota().used }}
            <span class="text-sm font-normal text-app-text-tertiary">
              / {{ fieldQuota().limit === -1 ? ('subscription.usage.unlimited' | translate) : fieldQuota().limit }}
            </span>
          </p>
        </div>
      </div>

      @if (adminAtLimit() || fieldAtLimit()) {
        <div class="bg-app-warning/10 border border-app-warning/30 rounded-lg p-4 space-y-2 max-w-5xl">
          @if (adminAtLimit()) {
            <p class="text-sm text-app-text">
              <i class="pi pi-exclamation-triangle mr-1 text-app-warning"></i>
              {{ 'tenantUsers.adminLimitReached' | translate: { used: adminQuota().used, limit: adminQuota().limit } }}
            </p>
          }
          @if (fieldAtLimit()) {
            <p class="text-sm text-app-text">
              <i class="pi pi-exclamation-triangle mr-1 text-app-warning"></i>
              {{ 'tenantUsers.fieldLimitReached' | translate: { used: fieldQuota().used, limit: fieldQuota().limit } }}
            </p>
          }
          <p-button [label]="'tenantUsers.changePlan' | translate" [text]="true" size="small"
                    icon="pi pi-crown" (onClick)="goToSubscription()"></p-button>
        </div>
      }

      @if (loadError()) {
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <i class="pi pi-exclamation-triangle text-3xl text-app-danger mb-3" aria-hidden="true"></i>
          <p class="text-sm font-medium text-app-text">{{ 'tenantUsers.loadErrorTitle' | translate }}</p>
          <p-button [label]="'tenantUsers.retry' | translate" [text]="true" size="small" class="mt-3"
                    (onClick)="load()"></p-button>
        </div>
      } @else if (teamEmpty()) {
        <app-empty-state icon="pi pi-users" [message]="'tenantUsers.empty' | translate"
                          [subtitle]="'tenantUsers.emptySubtitle' | translate">
        </app-empty-state>
      } @else {
      <p-panel>
        <div class="space-y-4 min-w-0">
          <div class="flex flex-wrap items-end gap-3">
            <div class="flex-1 min-w-56">
              <label class="label" for="teamSearch">{{ 'common.search' | translate }}</label>
              <input pInputText id="teamSearch" fluid [ngModel]="search()"
                     [placeholder]="'tenantUsers.searchPlaceholder' | translate"
                     autocomplete="off" (ngModelChange)="search.set($event)" />
            </div>
            <div class="w-52">
              <label class="label">{{ 'tenantUsers.role' | translate }}</label>
              <p-select [options]="roleFilterOptions" [ngModel]="roleFilter()" optionLabel="label" optionValue="value"
                        appendTo="body" fluid [showClear]="true" [placeholder]="'tenantUsers.allRoles' | translate"
                        (ngModelChange)="roleFilter.set($event)"></p-select>
            </div>
            <div class="w-44">
              <label class="label">{{ 'common.status' | translate }}</label>
              <p-select [options]="statusFilterOptions" [ngModel]="statusFilter()" optionLabel="label" optionValue="value"
                        appendTo="body" fluid [showClear]="true" [placeholder]="'tenantUsers.allStatuses' | translate"
                        (ngModelChange)="statusFilter.set($event)"></p-select>
            </div>
            @if (hasActiveFilters()) {
              <p-button [label]="'common.clearFilters' | translate" icon="pi pi-filter-slash" [text]="true" size="small"
                        (onClick)="clearFilters()"></p-button>
            }
          </div>

          <div class="overflow-x-auto min-w-0">
            <p-table appTableStandard [value]="filteredRows()" dataKey="id" styleClass="p-datatable-sm"
                     [rows]="20" [loading]="loading()" [sortField]="'name'" [sortOrder]="1">
              <ng-template pTemplate="header">
                <tr>
                  <th pSortableColumn="name">{{ 'tenantUsers.colMember' | translate }} <p-sortIcon field="name"></p-sortIcon></th>
                  <th class="hidden sm:table-cell">{{ 'tenantUsers.colType' | translate }}</th>
                  <th>{{ 'tenantUsers.role' | translate }}</th>
                  <th>{{ 'common.status' | translate }}</th>
                  <th class="hidden md:table-cell">{{ 'tenantUsers.colLastLogin' | translate }}</th>
                  <th class="text-right w-24">{{ 'common.actions' | translate }}</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-row>
                <tr class="group cursor-pointer" (click)="openDetail(row)">
                  <td>
                    <div class="font-medium text-app-text">{{ row.name }}</div>
                    <div class="text-xs text-app-text-tertiary">{{ row.email }}</div>
                  </td>
                  <td class="hidden sm:table-cell">
                    <app-tag-badge [value]="categoryLabel(row.category) | translate" [severity]="categorySeverity(row.category)"></app-tag-badge>
                  </td>
                  <td>
                    @if (row.role === 'OWNER') {
                      <app-tag-badge [value]="'tenantUsers.ownerBadge' | translate" severity="info"></app-tag-badge>
                    } @else {
                      <app-tag-badge [value]="row.role | roleLabel" [severity]="roleSeverity(row.role)"></app-tag-badge>
                    }
                  </td>
                  <td>
                    <app-tag-badge [value]="statusLabel(row.status) | translate" [severity]="statusSeverity(row.status)"></app-tag-badge>
                  </td>
                  <td class="hidden md:table-cell whitespace-nowrap text-sm text-app-text-secondary">
                    @if (row.kind === 'user') {
                      {{ row.lastLoginAt ? (row.lastLoginAt | localizedDate: 'datetime') : ('tenantUsers.neverLoggedIn' | translate) }}
                    } @else {
                      {{ 'tenantUsers.colExpires' | translate }}: {{ row.expiresAt | localizedDate: 'datetime' }}
                    }
                  </td>
                  <td class="text-right whitespace-nowrap" (click)="$event.stopPropagation()">
                    @if (row.kind === 'user' && row.role !== 'OWNER') {
                      <span>
                        @if (row.status === 'ACTIVE') {
                          <p-button icon="pi pi-times-circle" [text]="true" size="small" severity="warn"
                                    [pTooltip]="'tenantUsers.deactivate' | translate" tooltipPosition="top"
                                    [loading]="pendingUserId() === row.id" (onClick)="confirmDeactivate(row.user)"></p-button>
                        } @else {
                          <span [pTooltip]="(atLimitFor(row.role) ? 'tenantUsers.reactivateBlockedTooltip' : 'tenantUsers.activate') | translate"
                                tooltipPosition="top" class="inline-flex">
                            <p-button icon="pi pi-check-circle" [text]="true" size="small" severity="info"
                                      [disabled]="atLimitFor(row.role)"
                                      [loading]="pendingUserId() === row.id" (onClick)="activate(row.user)"></p-button>
                          </span>
                        }
                      </span>
                    } @else if (row.kind === 'invitation') {
                      <span>
                        <p-button icon="pi pi-send" [text]="true" size="small" severity="secondary"
                                  [pTooltip]="'tenantUsers.resend' | translate" tooltipPosition="top"
                                  [loading]="pendingInvitationId() === row.id" (onClick)="resendInvitation(row.invitation)"></p-button>
                        <p-button icon="pi pi-times" [text]="true" size="small" severity="danger"
                                  [pTooltip]="'tenantUsers.cancelInvite' | translate" tooltipPosition="top"
                                  [loading]="pendingInvitationId() === row.id" (onClick)="confirmCancelInvitation(row.invitation)"></p-button>
                      </span>
                    }
                  </td>
                </tr>
              </ng-template>
              <ng-template pTemplate="emptymessage">
                <tr>
                  <td colspan="6" class="text-center text-app-text-tertiary py-10">
                    <i class="pi pi-search text-2xl mb-2 block"></i>
                    <p class="text-sm font-medium text-app-text">{{ 'tenantUsers.noMatchTitle' | translate }}</p>
                    <p class="text-xs mt-1">{{ 'tenantUsers.noMatchSubtitle' | translate }}</p>
                    <p-button [label]="'common.clearFilters' | translate" [text]="true" size="small" class="inline-block mt-2"
                              (onClick)="clearFilters()"></p-button>
                  </td>
                </tr>
              </ng-template>
            </p-table>
          </div>
        </div>
      </p-panel>
      }
    </div>

    <!-- Dialog: convidar membro -->
    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '28rem' }"
              [header]="'tenantUsers.inviteDialogTitle' | translate">
      <div class="space-y-4" [formGroup]="inviteForm">
        <div>
          <label class="label">{{ 'common.email' | translate }} *</label>
          <input pInputText formControlName="email" [placeholder]="'tenantUsers.emailPlaceholder' | translate" fluid />
        </div>
        <div>
          <label class="label">{{ 'tenantUsers.role' | translate }} *</label>
          <p-select formControlName="role" [options]="roleOptions" optionLabel="label" optionValue="value"
                    appendTo="body" fluid [placeholder]="'tenantUsers.rolePlaceholder' | translate"></p-select>
        </div>
        @if (selectedRoleAtLimit()) {
          <p class="text-sm text-app-warning">
            <i class="pi pi-exclamation-triangle mr-1"></i>
            {{ (selectedGroup() === 'ADMINISTRATIVE' ? 'tenantUsers.adminLimitReached' : 'tenantUsers.fieldLimitReached')
                | translate: { used: selectedQuota()?.used, limit: selectedQuota()?.limit } }}
          </p>
        }
        <div class="flex justify-end gap-2">
          <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="dialogVisible.set(false)"></p-button>
          <p-button [label]="'tenantUsers.invite' | translate" icon="pi pi-check"
                    [loading]="inviting()" [disabled]="!canSubmitInvite()" (onClick)="submitInvite()"></p-button>
        </div>
      </div>
    </p-dialog>

    <!-- Dialog: senha resetada — some ao fechar, hash é one-way, não há como recuperar depois -->
    <p-dialog [(visible)]="credentialsVisible" [modal]="true" [closable]="false" [style]="{ width: '26rem' }"
              [header]="'tenantUsers.resetPasswordResultTitle' | translate">
      @if (credentialsResult(); as result) {
        <div class="space-y-4">
          <p class="text-sm text-app-warning flex items-start gap-1.5">
            <i class="pi pi-exclamation-triangle mt-0.5"></i>
            <span>{{ 'tenantUsers.resetPasswordResultWarning' | translate }}</span>
          </p>
          <div>
            <label class="label">{{ 'common.email' | translate }}</label>
            <p class="text-sm font-mono text-app-text">{{ result.email }}</p>
          </div>
          <div>
            <label class="label">{{ 'tenantUsers.resetPasswordResultPassword' | translate }}</label>
            <p class="text-sm font-mono text-app-text flex items-center gap-1.5">
              <span>{{ result.temporaryPassword }}</span>
              <p-button icon="pi pi-copy" [text]="true" size="small"
                        [pTooltip]="'common.copy' | translate" tooltipPosition="top"
                        (onClick)="copyToClipboard(result.temporaryPassword)"></p-button>
            </p>
          </div>
          <div class="flex justify-end">
            <p-button [label]="'tenantUsers.resetPasswordResultClose' | translate" (onClick)="closeCredentials()"></p-button>
          </div>
        </div>
      }
    </p-dialog>

    <!-- Drawer: detalhe do membro -->
    <p-drawer #drawerRef [(visible)]="drawerVisible" position="right" [dismissible]="true" [closeOnEscape]="true"
              styleClass="w-full! sm:w-[26rem]! md:w-[30rem]!" (onHide)="onDrawerHide()">
      <ng-template #header>
        @if (drawerRow(); as row) {
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-semibold text-app-text truncate">{{ row.name }}</span>
            <app-tag-badge [value]="statusLabel(row.status) | translate" [severity]="statusSeverity(row.status)"></app-tag-badge>
          </div>
        }
      </ng-template>

      @if (drawerRow(); as row) {
        <div class="space-y-5 pb-4">
          <section class="space-y-2">
            <h4 class="section-title">{{ 'tenantUsers.detail.generalSection' | translate }}</h4>
            <dl class="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
              <div class="col-span-2">
                <dt class="text-app-text-tertiary text-xs">{{ 'common.email' | translate }}</dt>
                <dd class="text-app-text flex items-center gap-1.5">
                  <span>{{ row.email }}</span>
                  <p-button icon="pi pi-copy" [text]="true" size="small"
                            [pTooltip]="'common.copy' | translate" tooltipPosition="top"
                            (onClick)="copyToClipboard(row.email)"></p-button>
                </dd>
              </div>
              <div>
                <dt class="text-app-text-tertiary text-xs">{{ 'tenantUsers.colType' | translate }}</dt>
                <dd class="text-app-text">{{ categoryLabel(row.category) | translate }}</dd>
              </div>
              <div>
                <dt class="text-app-text-tertiary text-xs">{{ 'tenantUsers.role' | translate }}</dt>
                <dd class="text-app-text">{{ row.role === 'OWNER' ? ('tenantUsers.ownerBadge' | translate) : (row.role | roleLabel) }}</dd>
              </div>
              @if (row.kind === 'user') {
                <div>
                  <dt class="text-app-text-tertiary text-xs">{{ 'tenantUsers.detail.memberSince' | translate }}</dt>
                  <dd class="text-app-text">{{ row.createdAt | localizedDate: 'date' }}</dd>
                </div>
                <div>
                  <dt class="text-app-text-tertiary text-xs">{{ 'tenantUsers.colLastLogin' | translate }}</dt>
                  <dd class="text-app-text">{{ row.lastLoginAt ? (row.lastLoginAt | localizedDate: 'datetime') : ('tenantUsers.neverLoggedIn' | translate) }}</dd>
                </div>
              } @else {
                <div>
                  <dt class="text-app-text-tertiary text-xs">{{ 'tenantUsers.detail.invitedOn' | translate }}</dt>
                  <dd class="text-app-text">{{ row.createdAt | localizedDate: 'date' }}</dd>
                </div>
                <div>
                  <dt class="text-app-text-tertiary text-xs">{{ 'tenantUsers.detail.expiresOn' | translate }}</dt>
                  <dd class="text-app-text">{{ row.expiresAt | localizedDate: 'datetime' }}</dd>
                </div>
              }
            </dl>
          </section>

          @if (row.kind === 'user' && isOwner() && row.role !== 'OWNER' && row.role !== 'TECHNICIAN' && row.role !== 'LAUNDRY') {
            <section class="space-y-2 border-t border-app-border pt-4">
              <h4 class="section-title">{{ 'tenantUsers.detail.editRoleSection' | translate }}</h4>
              <div class="flex items-end gap-2" [formGroup]="drawerRoleForm">
                <div class="flex-1">
                  <p-select formControlName="role" [options]="roleOptions" optionLabel="label" optionValue="value"
                            appendTo="body" fluid></p-select>
                </div>
                <p-button [label]="'tenantUsers.detail.saveRole' | translate" icon="pi pi-check" size="small"
                          [loading]="savingRole()" [disabled]="drawerRoleForm.value.role === row.role"
                          (onClick)="saveRoleFromDrawer(row)"></p-button>
              </div>
            </section>
          }

          @if (row.kind === 'user' && row.role === 'TECHNICIAN') {
            <section class="space-y-3 border-t border-app-border pt-4">
              <h4 class="section-title">{{ 'tenantUsers.detail.providerSection' | translate }}</h4>
              @if (drawerProviderLoading()) {
                <p class="text-sm text-app-text-tertiary">
                  <i class="pi pi-spin pi-spinner mr-1"></i>{{ 'tenantUsers.detail.providerLoading' | translate }}
                </p>
              } @else if (drawerProvider(); as provider) {
                @if (isIncomplete(provider)) {
                  <p class="text-sm text-app-warning flex items-start gap-1.5">
                    <i class="pi pi-exclamation-triangle mt-0.5"></i>
                    <span>{{ 'providers.incompleteTooltip' | translate }}</span>
                  </p>
                }
                <div>
                  <dt class="text-app-text-tertiary text-xs mb-1">{{ 'providers.skills' | translate }}</dt>
                  @if (provider.skillIds.length === 0) {
                    <p class="text-sm text-app-text-tertiary">{{ 'providers.noSkills' | translate }}</p>
                  } @else {
                    <div class="flex flex-wrap gap-1.5">
                      @for (skillId of provider.skillIds; track skillId) {
                        <span class="inline-flex items-center px-2.5 py-1 rounded-full bg-app-accent-soft text-app-text text-xs font-medium">
                          {{ skillName(skillId) }}
                        </span>
                      }
                    </div>
                  }
                </div>
                <dl class="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
                  <div>
                    <dt class="text-app-text-tertiary text-xs">{{ 'providers.capacity' | translate }}</dt>
                    <dd class="text-app-text">{{ capacitySummary(provider) }}</dd>
                  </div>
                  <div>
                    <dt class="text-app-text-tertiary text-xs">{{ 'providers.tabWeekly' | translate }}</dt>
                    <dd class="text-app-text">
                      {{ (provider.hasWeeklyAvailability ? 'tenantUsers.detail.weeklyConfigured' : 'tenantUsers.detail.weeklyMissing') | translate }}
                    </dd>
                  </div>
                </dl>
                <p-button [label]="'tenantUsers.detail.manageProvider' | translate" icon="pi pi-arrow-right" iconPos="right"
                          [text]="true" size="small" (onClick)="goToProvider(provider)"></p-button>
              } @else {
                <p class="text-sm text-app-text-tertiary">{{ 'tenantUsers.detail.providerNotFound' | translate }}</p>
              }
            </section>
          }
        </div>
      }

      <ng-template #footer>
        @if (drawerRow(); as row) {
          @if (row.kind === 'user' && row.role !== 'OWNER') {
            <div class="flex justify-end gap-2">
              <p-button [label]="'tenantUsers.resetPassword' | translate" icon="pi pi-key" severity="secondary"
                        [loading]="resettingPasswordId() === row.id" (onClick)="confirmResetPassword(row.user)"></p-button>
              @if (row.status === 'ACTIVE') {
                <p-button [label]="'tenantUsers.deactivate' | translate" icon="pi pi-times-circle" severity="warn" [outlined]="true"
                          [loading]="pendingUserId() === row.id" (onClick)="confirmDeactivate(row.user)"></p-button>
              } @else {
                <span [pTooltip]="(atLimitFor(row.role) ? 'tenantUsers.reactivateBlockedTooltip' : '') | translate" tooltipPosition="top">
                  <p-button [label]="'tenantUsers.activate' | translate" icon="pi pi-check-circle" severity="info" [outlined]="true"
                            [disabled]="atLimitFor(row.role)"
                            [loading]="pendingUserId() === row.id" (onClick)="activate(row.user)"></p-button>
                </span>
              }
            </div>
          } @else if (row.kind === 'invitation') {
            <div class="flex justify-end gap-2">
              <p-button [label]="'tenantUsers.cancelInvite' | translate" icon="pi pi-times" severity="danger" [outlined]="true"
                        [loading]="pendingInvitationId() === row.id" (onClick)="confirmCancelInvitation(row.invitation)"></p-button>
              <p-button [label]="'tenantUsers.resend' | translate" icon="pi pi-send"
                        [loading]="pendingInvitationId() === row.id" (onClick)="resendInvitation(row.invitation)"></p-button>
            </div>
          }
        }
      </ng-template>
    </p-drawer>
  `,
  styles: [`
    @reference "../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
    .section-title { @apply text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary; }
  `],
})
export class TenantUsersComponent implements OnInit {
  private auth = inject(AuthService);
  private subService = inject(SubscriptionService);
  private tenantUserService = inject(TenantUserService);
  private providerService = inject(ProviderService);
  private skillService = inject(SkillService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private translate = inject(TranslateService);
  private router = inject(Router);

  users = signal<TenantUser[]>([]);
  invitations = signal<TenantInvitation[]>([]);
  loading = signal(true);
  loadError = signal(false);
  skillsById = new Map<string, Skill>();

  rows = computed<TeamRow[]>(() => [
    ...this.users().map(u => this.toUserRow(u)),
    ...this.invitations().map(i => this.toInvitationRow(i)),
  ]);
  teamEmpty = computed(() => !this.loading() && !this.loadError() && this.rows().length === 0);

  search = signal('');
  roleFilter = signal<UserRole | null>(null);
  statusFilter = signal<MemberStatus | null>(null);
  filteredRows = computed(() => this.rows().filter(r => this.matchesFilters(r)));

  dialogVisible = signal(false);
  inviting = signal(false);
  readonly inviteForm = new FormGroup({
    email: new FormControl('', { nonNullable: true }),
    role: new FormControl<UserRole | null>(null),
  });
  private readonly inviteFormValue = toSignal(this.inviteForm.valueChanges, { initialValue: this.inviteForm.getRawValue() });

  pendingUserId = signal<string | null>(null);
  pendingInvitationId = signal<string | null>(null);
  savingRole = signal(false);
  resettingPasswordId = signal<string | null>(null);
  credentialsVisible = signal(false);
  credentialsResult = signal<ResetPasswordResult | null>(null);

  drawerVisible = signal(false);
  @ViewChild('drawerRef') private drawerRef?: Drawer;
  drawerRow = signal<TeamRow | null>(null);
  private pendingProviderNavId: string | null = null;
  drawerProvider = signal<Provider | null>(null);
  drawerProviderLoading = signal(false);
  readonly drawerRoleForm = new FormGroup({
    role: new FormControl<UserRole | null>(null),
  });

  readonly roleOptions = INVITABLE_ROLES.map(r => ({ label: translateRole(this.translate, r.role), value: r.role }));
  /** Filtro cobre todo perfil que aparece na lista, não só os convidáveis daqui — TECHNICIAN e
   *  LAUNDRY nascem noutra tela mas continuam listados nesta. */
  readonly roleFilterOptions = (Object.keys(ROLE_GROUP) as UserRole[])
    .filter(role => role !== 'PLATFORM_ADMIN')
    .map(role => ({
      label: role === 'OWNER' ? this.translate.instant('tenantUsers.ownerBadge') : translateRole(this.translate, role),
      value: role,
    }));
  readonly statusFilterOptions: { label: string; value: MemberStatus }[] = [
    { label: this.translate.instant('common.active'), value: 'ACTIVE' },
    { label: this.translate.instant('common.inactive'), value: 'INACTIVE' },
    { label: this.translate.instant('tenantUsers.statusPending'), value: 'PENDING' },
  ];

  isOwner = () => this.auth.userRole() === 'OWNER';

  private me = this.subService.me;
  adminQuota = computed<Quota>(() => this.me()?.usage.adminUsers ?? { used: 0, limit: -1 });
  fieldQuota = computed<Quota>(() => this.me()?.usage.fieldUsers ?? { used: 0, limit: -1 });
  adminAtLimit = computed(() => !this.subService.hasQuota(this.adminQuota()));
  fieldAtLimit = computed(() => !this.subService.hasQuota(this.fieldQuota()));
  bothAtLimit = computed(() => this.adminAtLimit() && this.fieldAtLimit());

  selectedGroup = computed<QuotaGroup | null>(() => {
    const role = this.inviteFormValue().role;
    return role ? (INVITABLE_ROLES.find(r => r.role === role)?.group ?? null) : null;
  });
  selectedQuota = computed<Quota | null>(() => {
    const group = this.selectedGroup();
    if (group === 'ADMINISTRATIVE') return this.adminQuota();
    if (group === 'FIELD') return this.fieldQuota();
    return null;
  });
  selectedRoleAtLimit = computed(() => {
    const q = this.selectedQuota();
    return q ? !this.subService.hasQuota(q) : false;
  });
  canSubmitInvite = computed(() => {
    const { email, role } = this.inviteFormValue();
    return !!role && EMAIL_RE.test((email ?? '').trim()) && !this.selectedRoleAtLimit() && !this.inviting();
  });

  ngOnInit(): void {
    this.skillService.list().subscribe({
      next: skills => skills.forEach(s => this.skillsById.set(s.id, s)),
      error: () => {},
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.subService.getMe().subscribe();
    forkJoin({
      users: this.tenantUserService.list(),
      invitations: this.tenantUserService.listInvitations(),
    }).subscribe({
      next: ({ users, invitations }) => {
        this.users.set(users);
        this.invitations.set(invitations);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  private reload(): void {
    this.subService.getMe().subscribe();
    this.tenantUserService.list().subscribe(users => this.users.set(users));
    this.tenantUserService.listInvitations().subscribe(invitations => this.invitations.set(invitations));
  }

  private toUserRow(u: TenantUser): TeamRow {
    return {
      kind: 'user', id: u.id, name: u.name, email: u.email, role: u.role,
      category: this.categoryOf(u.role, u.quotaGroup), status: u.active ? 'ACTIVE' : 'INACTIVE',
      lastLoginAt: u.lastLoginAt, createdAt: u.createdAt, expiresAt: null,
      user: u, invitation: null,
    };
  }

  private toInvitationRow(i: TenantInvitation): TeamRow {
    return {
      kind: 'invitation', id: i.id, name: i.email, email: i.email, role: i.role,
      category: this.categoryOf(i.role, i.quotaGroup), status: 'PENDING',
      lastLoginAt: null, createdAt: i.createdAt, expiresAt: i.expiresAt,
      user: null, invitation: i,
    };
  }

  /**
   * `quotaGroup` vem do backend (`UserRole.isField()`) — fonte real da divisão administrativo/
   * campo. `groupOf`/`INVITABLE_ROLES` é só a lista do que esta tela oferece para convidar, e
   * não cobre TECHNICIAN (nasce via Prestadores); usá-la aqui classificava todo técnico como
   * administrativo.
   */
  categoryOf(role: UserRole, quotaGroup: QuotaGroup): MemberCategory {
    if (role === 'OWNER') return 'OWNER';
    return quotaGroup === 'FIELD' ? 'FIELD' : 'ADMINISTRATIVE';
  }

  categoryLabel(category: MemberCategory): string {
    return category === 'OWNER' ? 'tenantUsers.ownerBadge'
      : category === 'FIELD' ? 'tenantUsers.groupField' : 'tenantUsers.groupAdministrative';
  }

  categorySeverity(category: MemberCategory): BadgeSeverity {
    return category === 'OWNER' ? 'info' : category === 'FIELD' ? 'primary' : 'secondary';
  }

  private static readonly ROLE_SEVERITY: Partial<Record<UserRole, BadgeSeverity>> = {
    ADMIN: 'danger',
    COMMERCIAL: 'info',
    OPERATOR: 'primary',
    FINANCE: 'success',
    TECHNICIAN: 'warn',
    LAUNDRY: 'secondary',
  };

  roleSeverity(role: UserRole): BadgeSeverity {
    return TenantUsersComponent.ROLE_SEVERITY[role] ?? 'secondary';
  }

  statusLabel(status: MemberStatus): string {
    return status === 'ACTIVE' ? 'common.active' : status === 'INACTIVE' ? 'common.inactive' : 'tenantUsers.statusPending';
  }

  statusSeverity(status: MemberStatus): BadgeSeverity {
    return status === 'ACTIVE' ? 'success' : status === 'INACTIVE' ? 'secondary' : 'warn';
  }

  private matchesFilters(row: TeamRow): boolean {
    const term = this.search().trim().toLowerCase();
    if (term && !row.name.toLowerCase().includes(term) && !row.email.toLowerCase().includes(term)) return false;
    const role = this.roleFilter();
    if (role && row.role !== role) return false;
    const status = this.statusFilter();
    if (status && row.status !== status) return false;
    return true;
  }

  hasActiveFilters(): boolean {
    return !!this.search().trim() || this.roleFilter() !== null || this.statusFilter() !== null;
  }

  clearFilters(): void {
    this.search.set('');
    this.roleFilter.set(null);
    this.statusFilter.set(null);
  }

  goToSubscription(): void {
    this.router.navigate(['/subscription']);
  }

  groupOf(role: UserRole): QuotaGroup {
    return ROLE_GROUP[role] ?? 'NONE';
  }

  atLimitFor(role: UserRole): boolean {
    const group = this.groupOf(role);
    if (group === 'ADMINISTRATIVE') return this.adminAtLimit();
    if (group === 'FIELD') return this.fieldAtLimit();
    return false;
  }

  openInviteDialog(): void {
    this.inviteForm.reset({ email: '', role: null });
    this.dialogVisible.set(true);
  }

  submitInvite(): void {
    if (!this.canSubmitInvite()) return;
    this.inviting.set(true);
    const { email, role } = this.inviteForm.getRawValue();
    const trimmedEmail = email.trim();
    this.tenantUserService.invite({ email: trimmedEmail, role: role! }).subscribe({
      next: () => {
        this.inviting.set(false);
        this.dialogVisible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('tenantUsers.invited', { email: trimmedEmail })
        });
        this.reload();
      },
      error: (err: HttpErrorResponse) => this.handleError(err, () => this.inviting.set(false), 'tenantUsers.inviteError'),
    });
  }

  resendInvitation(invitation: TenantInvitation | null): void {
    if (!invitation || this.pendingInvitationId()) return;
    this.pendingInvitationId.set(invitation.id);
    this.tenantUserService.resendInvitation(invitation.id).subscribe({
      next: updated => {
        this.pendingInvitationId.set(null);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('tenantUsers.resent') });
        this.syncDrawerAfterInvitationUpdate(updated);
        this.reload();
      },
      error: (err: HttpErrorResponse) => this.handleError(err, () => this.pendingInvitationId.set(null), 'tenantUsers.resendError'),
    });
  }

  confirmCancelInvitation(invitation: TenantInvitation | null): void {
    if (!invitation) return;
    this.confirmationService.confirm({
      message: this.translate.instant('tenantUsers.cancelInviteConfirm', { email: invitation.email }),
      header: this.translate.instant('tenantUsers.cancelInviteConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('tenantUsers.cancelInvite'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.cancelInvitation(invitation),
    });
  }

  private cancelInvitation(invitation: TenantInvitation): void {
    if (this.pendingInvitationId()) return;
    this.pendingInvitationId.set(invitation.id);
    this.tenantUserService.cancelInvitation(invitation.id).subscribe({
      next: () => {
        this.pendingInvitationId.set(null);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('tenantUsers.cancelled') });
        if (this.drawerRow()?.id === invitation.id) this.drawerVisible.set(false);
        this.reload();
      },
      error: (err: HttpErrorResponse) => this.handleError(err, () => this.pendingInvitationId.set(null), 'tenantUsers.cancelError'),
    });
  }

  activate(user: TenantUser | null): void {
    if (!user || this.pendingUserId()) return;
    this.pendingUserId.set(user.id);
    this.tenantUserService.setActive(user.id, true).subscribe({
      next: updated => {
        this.pendingUserId.set(null);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('tenantUsers.activated', { name: user.name }) });
        this.syncDrawerAfterUserUpdate(updated);
        this.reload();
      },
      error: (err: HttpErrorResponse) => this.handleError(err, () => this.pendingUserId.set(null), 'tenantUsers.activateError'),
    });
  }

  confirmDeactivate(user: TenantUser | null): void {
    if (!user) return;
    this.confirmationService.confirm({
      message: this.translate.instant('tenantUsers.deactivateConfirm', { name: user.name }),
      header: this.translate.instant('tenantUsers.deactivateConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('tenantUsers.deactivate'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'warn' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.deactivate(user),
    });
  }

  private deactivate(user: TenantUser): void {
    if (this.pendingUserId()) return;
    this.pendingUserId.set(user.id);
    this.tenantUserService.setActive(user.id, false).subscribe({
      next: updated => {
        this.pendingUserId.set(null);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('tenantUsers.deactivated', { name: user.name }) });
        this.syncDrawerAfterUserUpdate(updated);
        this.reload();
      },
      error: (err: HttpErrorResponse) => this.handleError(err, () => this.pendingUserId.set(null), 'tenantUsers.deactivateError'),
    });
  }

  confirmResetPassword(user: TenantUser | null): void {
    if (!user) return;
    this.confirmationService.confirm({
      message: this.translate.instant('tenantUsers.resetPasswordConfirm', { name: user.name }),
      header: this.translate.instant('tenantUsers.resetPasswordConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('tenantUsers.resetPassword'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'warn' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.resetPassword(user),
    });
  }

  private resetPassword(user: TenantUser): void {
    if (this.resettingPasswordId()) return;
    this.resettingPasswordId.set(user.id);
    this.tenantUserService.resetPassword(user.id).subscribe({
      next: result => {
        this.resettingPasswordId.set(null);
        this.credentialsResult.set(result);
        this.credentialsVisible.set(true);
      },
      error: (err: HttpErrorResponse) => this.handleError(err, () => this.resettingPasswordId.set(null), 'tenantUsers.resetPasswordError'),
    });
  }

  closeCredentials(): void {
    this.credentialsVisible.set(false);
    this.credentialsResult.set(null);
  }

  saveRoleFromDrawer(row: TeamRow): void {
    const role = this.drawerRoleForm.value.role;
    if (!row.user || !role || this.savingRole() || role === row.role) return;
    this.savingRole.set(true);
    this.tenantUserService.changeRole(row.user.id, role).subscribe({
      next: updated => {
        this.savingRole.set(false);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('tenantUsers.roleChanged', { name: updated.name }) });
        this.syncDrawerAfterUserUpdate(updated);
        this.reload();
      },
      error: (err: HttpErrorResponse) => this.handleError(err, () => this.savingRole.set(false), 'tenantUsers.roleChangeError'),
    });
  }

  /** Clique numa linha — abre o Drawer com os dados já carregados; para técnicos/lavandaria busca o prestador ligado. */
  openDetail(row: TeamRow): void {
    this.drawerRow.set(row);
    this.drawerRoleForm.reset({ role: row.role });
    this.drawerProvider.set(null);
    this.drawerProviderLoading.set(false);
    this.drawerVisible.set(true);
    if (row.kind === 'user' && row.role === 'TECHNICIAN' && row.user) {
      this.drawerProviderLoading.set(true);
      this.providerService.getByUserId(row.user.id).subscribe(provider => {
        this.drawerProvider.set(provider);
        this.drawerProviderLoading.set(false);
      });
    }
  }

  copyToClipboard(value: string): void {
    navigator.clipboard.writeText(value).then(() => {
      this.messageService.add({ severity: 'success', summary: this.translate.instant('common.copied') });
    });
  }

  private syncDrawerAfterUserUpdate(updated: TenantUser): void {
    if (this.drawerRow()?.id !== updated.id) return;
    this.drawerRow.set(this.toUserRow(updated));
    this.drawerRoleForm.reset({ role: updated.role });
  }

  private syncDrawerAfterInvitationUpdate(updated: TenantInvitation): void {
    if (this.drawerRow()?.id !== updated.id) return;
    this.drawerRow.set(this.toInvitationRow(updated));
  }

  /**
   * Fecha o Drawer primeiro e só navega depois de `onHide` — navegar no mesmo tick destrói o
   * componente a meio da animação de saída do PrimeNG e deixa o overlay/backdrop preso no DOM.
   *
   * `drawerVisible.set(false)` não basta: o setter de `visible` do Drawer só marca o estado, sem
   * disparar `hide()` — `onHide` só é emitido pelo `close()` interno (clique na máscara, botão X,
   * Escape). Chamar `drawerRef.close()` diretamente é o que aciona esse `hide()` e garante que o
   * evento dispare também num fecho iniciado por código.
   */
  goToProvider(provider: Provider): void {
    this.pendingProviderNavId = provider.id;
    if (this.drawerRef) {
      this.drawerRef.close(new Event('click', { cancelable: true }));
    } else {
      this.drawerVisible.set(false);
      this.onDrawerHide();
    }
  }

  onDrawerHide(): void {
    const id = this.pendingProviderNavId;
    if (!id) return;
    this.pendingProviderNavId = null;
    // `onHide` fires the instant close() runs — the mask only leaves the DOM later, on its own
    // CSS `animationend` (PrimeNG's `destroyModal`, ~500ms). Navigating now destroys this
    // component before that fires, orphaning a full-viewport `.p-drawer-mask` with
    // `pointer-events: auto` that then blocks every click on whatever renders next (confirmed:
    // it ate clicks on the Providers dialog's own close button). Since we're leaving the route
    // for good, the leave animation has nothing left to animate for — strip the mask outright
    // instead of waiting on a teardown that will never get to run.
    document.querySelectorAll('.p-drawer-mask').forEach(el => el.remove());
    this.router.navigate(['/providers'], { queryParams: { open: id } });
  }

  isIncomplete(p: Provider): boolean {
    return p.skillIds.length === 0 || !p.hasWeeklyAvailability;
  }

  skillName(id: string): string {
    return this.skillsById.get(id)?.name ?? '?';
  }

  capacitySummary(p: Provider): string {
    if (p.maxOrdersPerDay == null && p.maxMinutesPerDay == null && p.maxVolumePerDay == null) {
      return this.translate.instant('providers.capacityUnlimited');
    }
    const parts: string[] = [];
    if (p.maxOrdersPerDay != null) parts.push(this.translate.instant('providers.capacityOrders', { n: p.maxOrdersPerDay }));
    if (p.maxMinutesPerDay != null) parts.push(this.translate.instant('providers.capacityMinutes', { n: p.maxMinutesPerDay }));
    if (p.maxVolumePerDay != null) parts.push(this.translate.instant('providers.capacityVolume', { n: p.maxVolumePerDay }));
    return parts.join(' · ');
  }

  /**
   * O interceptor global já mostra o paywall (403 PLAN_LIMIT_EXCEEDED) e os erros de validação
   * (400). O que falta aqui são as regras de negócio (422) — email duplicado, convite já
   * pendente, dono imutável — que hoje não têm toast nenhum sem isto.
   */
  private handleError(err: HttpErrorResponse, resetPending: () => void, fallbackKey: string): void {
    resetPending();
    if (err.status !== 422) return;
    const code = (err.error as { errorCode?: string } | null)?.errorCode;
    const key = code ? `tenantUsers.errors.${code}` : '';
    const translated = key ? this.translate.instant(key) : '';
    this.messageService.add({
      severity: 'error',
      summary: translated && translated !== key ? translated : this.translate.instant(fallbackKey),
    });
  }
}
