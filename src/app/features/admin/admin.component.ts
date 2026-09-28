import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TagBadgeComponent } from '../../shared/components/tag-badge/tag-badge.component';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { RoleLabelPipe } from '../../shared/pipes/role-label.pipe';
import { ConfirmationService, MessageService } from 'primeng/api';
import { UserAccessComponent } from './user-access/user-access.component';
import { AiCostComponent } from './ai-cost/ai-cost.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { TableStandardDirective } from '../../shared/directives/table-standard.directive';

interface AdminUser { id: string; name: string; email: string; role: string; active: boolean; createdAt: string; }
/** Uma chave do ledger de trial. Nunca traz a identidade em claro — só o tipo e as datas. */
interface TrialLedgerEntry {
  grantId: string;
  identityType: 'EMAIL' | 'OAUTH_SUBJECT' | 'NIF';
  grantedAt: string;
  trialEndsAt: string;
  purgeAfter: string;
  exhausted: boolean;
}
interface TrialAuditEntry {
  id: string; adminEmail: string; action: string; profileKind: string;
  targetUserId: string | null; reason: string; createdAt: string;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslatePipe, TableModule, ButtonModule, TooltipModule,
    TabsModule, TagModule, InputTextModule, ConfirmDialogModule, LocalizedDatePipe, TagBadgeComponent, RoleLabelPipe,
    UserAccessComponent, AiCostComponent, PageHeaderComponent, EmptyStateComponent, TableStandardDirective],
  template: `
    <app-page-header [title]="'admin.title' | translate"></app-page-header>

    <div class="space-y-6">
      <!-- KPI Cards -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        @for (stat of stats(); track stat.label) {
          <div class="rounded-md border border-app-border p-4 text-center">
            <p class="text-2xl font-medium text-app-text">{{ stat.value }}</p>
            <p class="text-xs text-app-text-secondary mt-1">{{ stat.label | translate }}</p>
          </div>
        }
      </div>

      <p-tabs [value]="activeTab" (valueChange)="onTabChange($event)">
        <p-tablist>
          <p-tab value="0">{{ 'admin.tabUsers' | translate }}</p-tab>
          <p-tab value="1">{{ 'admin.tabTrials' | translate }}</p-tab>
          <p-tab value="2">{{ 'admin.tabAccess' | translate }}</p-tab>
          <p-tab value="3">{{ 'admin.tabAiCost' | translate }}</p-tab>
        </p-tablist>
        <p-tabpanels>
          <p-tabpanel value="0">
            <div class="space-y-3 pt-3">
              @if (usersEmpty()) {
                <app-empty-state icon="pi pi-users" [message]="'admin.emptyUsers' | translate"></app-empty-state>
              } @else {
              <div class="flex gap-3">
                <input pInputText [(ngModel)]="userSearch" [placeholder]="'common.search' | translate" class="w-64" autocomplete="off" />
              </div>
              <p-table appTableStandard [value]="users()" styleClass="p-datatable-sm" [rows]="20" [sortField]="'name'" [sortOrder]="1">
                <ng-template pTemplate="header">
                  <tr>
                    <th pSortableColumn="name">{{ 'common.name' | translate }} <p-sortIcon field="name"></p-sortIcon></th><th>{{ 'common.email' | translate }}</th><th>{{ 'admin.role' | translate }}</th><th>{{ 'common.status' | translate }}</th><th>{{ 'admin.registeredAt' | translate }}</th><th class="text-right w-20">{{ 'common.actions' | translate }}</th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-user>
                  <tr class="group">
                    <td class="font-medium text-app-text">{{ user.name }}</td>
                    <td class="text-app-text-secondary">{{ user.email }}</td>
                    <td><app-tag-badge [value]="user.role | roleLabel" severity="info"></app-tag-badge></td>
                    <td>
                      <app-tag-badge [value]="user.active ? ('common.active' | translate) : ('common.inactive' | translate)"
                                     [severity]="user.active ? 'success' : 'danger'"></app-tag-badge>
                    </td>
                    <td>{{ user.createdAt | localizedDate }}</td>
                    <td class="text-right whitespace-nowrap">
                      <span>
                        <p-button [icon]="user.active ? 'pi pi-times-circle' : 'pi pi-check-circle'"
                                  [text]="true" size="small" [severity]="user.active ? 'warn' : 'info'"
                                  [pTooltip]="user.active ? ('admin.deactivate' | translate) : ('admin.activate' | translate)"
                                  (click)="toggleUser(user)"></p-button>
                        @if (user.role !== 'ADMIN') {
                          <p-button icon="pi pi-trash" [text]="true" size="small" severity="danger"
                                    [pTooltip]="'admin.deleteAccount' | translate"
                                    (click)="confirmDeleteUser(user)"></p-button>
                        }
                      </span>
                    </td>
                  </tr>
                </ng-template>
              </p-table>
              }
            </div>
          </p-tabpanel>

          <p-tabpanel value="1">
            <div class="pt-4 space-y-6 max-w-3xl">
              <div class="space-y-4">
                <div class="flex items-start gap-3">
                  <i class="pi pi-shield text-2xl text-app-accent mt-0.5"></i>
                  <div>
                    <h3 class="font-semibold text-app-text">{{ 'admin.trialLookupTitle' | translate }}</h3>
                    <p class="text-sm text-app-text-secondary mt-1">{{ 'admin.trialLookupDesc' | translate }}</p>
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3" [formGroup]="trialLookupForm">
                  <div>
                    <label class="label" for="trialLookupEmail">{{ 'admin.trialLookupEmail' | translate }}</label>
                    <input pInputText id="trialLookupEmail" type="email" fluid formControlName="email" />
                  </div>
                  <div>
                    <label class="label" for="trialLookupNif">{{ 'admin.trialLookupNif' | translate }}</label>
                    <input pInputText id="trialLookupNif" fluid formControlName="nif" />
                  </div>
                </div>
                <div [formGroup]="trialLookupForm">
                  <!-- Obrigatório: qualquer leitura do ledger é acesso a dados pessoais e fica
                       auditada com esta justificação (RGPD Art. 5(2)). -->
                  <label class="label" for="trialLookupReason">{{ 'admin.trialReason' | translate }}</label>
                  <input pInputText id="trialLookupReason" fluid formControlName="reason" />
                </div>

                <p-button
                  [label]="'admin.trialLookupButton' | translate"
                  icon="pi pi-search"
                  [disabled]="trialLoading() || !trialLookupForm.controls.reason.value.trim() || (!trialLookupForm.controls.email.value.trim() && !trialLookupForm.controls.nif.value.trim())"
                  [loading]="trialLoading()"
                  (click)="lookupTrial()">
                </p-button>

                @if (trialEntries(); as entries) {
                  @if (entries.length === 0) {
                    <p class="text-sm text-app-text-secondary">{{ 'admin.trialNoEntries' | translate }}</p>
                  } @else {
                    <p-table appTableStandard [value]="entries" styleClass="p-datatable-sm" [rows]="10"
                             [sortField]="'grantedAt'" [sortOrder]="-1">
                      <ng-template pTemplate="header">
                        <tr>
                          <th>{{ 'admin.trialIdentityType' | translate }}</th>
                          <th pSortableColumn="grantedAt">{{ 'admin.trialGrantedAt' | translate }} <p-sortIcon field="grantedAt"></p-sortIcon></th>
                          <th>{{ 'admin.trialEndsAt' | translate }}</th>
                          <th>{{ 'admin.trialStatus' | translate }}</th>
                          <th class="w-12"></th>
                        </tr>
                      </ng-template>
                      <ng-template pTemplate="body" let-entry>
                        <tr class="group">
                          <td>{{ entry.identityType }}</td>
                          <td>{{ entry.grantedAt | localizedDate }}</td>
                          <td>{{ entry.trialEndsAt | localizedDate }}</td>
                          <td>
                            <app-tag-badge
                              [severity]="entry.exhausted ? 'danger' : 'success'"
                              [value]="(entry.exhausted ? 'admin.trialExhausted' : 'admin.trialActive') | translate">
                            </app-tag-badge>
                          </td>
                          <td class="text-right whitespace-nowrap">
                            <span>
                              <p-button
                                icon="pi pi-times"
                                severity="danger"
                                [text]="true"
                                [pTooltip]="'admin.trialRevoke' | translate"
                                (click)="revokeTrialGrant(entry)">
                              </p-button>
                            </span>
                          </td>
                        </tr>
                      </ng-template>
                    </p-table>
                  }
                }
              </div>

              <div class="space-y-3">
                <h3 class="font-semibold text-app-text">{{ 'admin.trialAuditTitle' | translate }}</h3>
                <p class="text-sm text-app-text-secondary">{{ 'admin.trialAuditDesc' | translate }}</p>
                <p-table appTableStandard [value]="trialAudit()" styleClass="p-datatable-sm" [rows]="10"
                         [sortField]="'createdAt'" [sortOrder]="-1">
                  <ng-template pTemplate="header">
                    <tr>
                      <th pSortableColumn="createdAt">{{ 'admin.trialAuditWhen' | translate }} <p-sortIcon field="createdAt"></p-sortIcon></th>
                      <th>{{ 'admin.trialAuditWho' | translate }}</th>
                      <th>{{ 'admin.trialAuditAction' | translate }}</th>
                      <th>{{ 'admin.trialReason' | translate }}</th>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="body" let-entry>
                    <tr>
                      <td>{{ entry.createdAt | localizedDate }}</td>
                      <td>{{ entry.adminEmail }}</td>
                      <td>{{ entry.action }}</td>
                      <td class="text-sm text-app-text-secondary">{{ entry.reason }}</td>
                    </tr>
                  </ng-template>
                </p-table>
              </div>
            </div>
          </p-tabpanel>

          <p-tabpanel value="2">
            <!-- Só monta ao abrir: o quadro de acessos refresca-se sozinho de 30 em 30 segundos e
                 não pode ficar a sondar o servidor a partir de um separador que ninguém está a ver. -->
            @if (activeTab === '2') {
              <app-user-access></app-user-access>
            }
          </p-tabpanel>

          <p-tabpanel value="3">
            <!-- Só monta ao abrir: é uma consulta agregada sobre a auditoria inteira. -->
            @if (activeTab === '3') {
              <app-ai-cost></app-ai-cost>
            }
          </p-tabpanel>
        </p-tabpanels>
      </p-tabs>
    </div>
  `
})
export class AdminComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);
  private confirmationService = inject(ConfirmationService);

  activeTab = '0';

  users = signal<AdminUser[]>([]);
  userSearch = '';
  usersEmpty = computed(() => this.users().length === 0);

  readonly trialLookupForm = new FormGroup({
    email: new FormControl('', { nonNullable: true }),
    nif: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true }),
  });
  trialLoading = signal(false);
  // null = ainda não pesquisou; [] = pesquisou e não encontrou. A distinção importa: "sem
  // registo" é uma resposta útil ao suporte, não um estado vazio.
  trialEntries = signal<TrialLedgerEntry[] | null>(null);
  trialAudit = signal<TrialAuditEntry[]>([]);

  stats = signal<{ label: string; value: number }[]>([
    { label: 'admin.totalUsers', value: 0 },
    { label: 'admin.tenants', value: 0 },
    { label: 'admin.administrativeUsers', value: 0 },
    { label: 'admin.fieldUsers', value: 0 },
  ]);

  onTabChange(value: string | number | undefined) {
    // Guardado no componente e não só no URL: o separador de acessos só é montado quando está
    // ativo, e essa decisão precisa de saber qual é o separador atual.
    this.activeTab = String(value ?? '0');
    this.router.navigate([], { queryParams: { tab: value }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  ngOnInit() {
    this.activeTab = this.route.snapshot.queryParamMap.get('tab') ?? '0';
    this.http.get<any>(`${environment.apiUrl}/admin/stats`).subscribe({
      next: s => this.stats.set([
        { label: 'admin.totalUsers', value: s.totalUsers },
        { label: 'admin.tenants', value: s.tenants },
        { label: 'admin.administrativeUsers', value: s.administrativeUsers },
        { label: 'admin.fieldUsers', value: s.fieldUsers },
      ]),
      error: () => {}
    });

    this.http.get<AdminUser[]>(`${environment.apiUrl}/admin/users`).subscribe({ next: u => this.users.set(u), error: () => {} });
    this.loadTrialAudit();
  }

  private loadTrialAudit() {
    this.http.get<TrialAuditEntry[]>(`${environment.apiUrl}/admin/trials/audit`)
      .subscribe({ next: a => this.trialAudit.set(a), error: () => {} });
  }

  lookupTrial() {
    const { email: rawEmail, nif: rawNif, reason: rawReason } = this.trialLookupForm.getRawValue();
    const email = rawEmail.trim();
    const nif = rawNif.trim();
    const reason = rawReason.trim();
    if (!reason || (!email && !nif)) return;

    this.trialLoading.set(true);
    // POST e não GET: o email do titular é dado pessoal e não pode acabar em logs de acesso
    // nem no histórico do browser através da query string.
    this.http.post<TrialLedgerEntry[]>(`${environment.apiUrl}/admin/trials/lookup`, {
      email: email || null, nif: nif || null, profileKind: 'OWNER', reason,
    }).subscribe({
      next: entries => {
        this.trialEntries.set(entries);
        this.trialLoading.set(false);
        this.loadTrialAudit();
      },
      error: () => {
        this.trialLoading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('admin.trialLookupError') });
      }
    });
  }

  revokeTrialGrant(entry: TrialLedgerEntry) {
    const reason = this.trialLookupForm.getRawValue().reason.trim();
    if (!reason) {
      this.messageService.add({ severity: 'warn', summary: this.translate.instant('admin.trialReasonRequired') });
      return;
    }

    this.confirmationService.confirm({
      message: this.translate.instant('admin.trialRevokeConfirm'),
      header: this.translate.instant('admin.trialRevoke'),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.http.delete(`${environment.apiUrl}/admin/trials/${entry.grantId}`, { body: { reason } }).subscribe({
          next: () => {
            this.trialEntries.set((this.trialEntries() ?? []).filter(e => e.grantId !== entry.grantId));
            this.messageService.add({ severity: 'success', summary: this.translate.instant('admin.trialRevoked') });
            this.loadTrialAudit();
          },
          error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('admin.trialRevokeError') })
        });
      }
    });
  }

  toggleUser(user: AdminUser) {
    this.http.patch(`${environment.apiUrl}/admin/users/${user.id}/toggle`, {}).subscribe({
      next: () => {
        this.users.update(us => us.map(u => u.id === user.id ? { ...u, active: !u.active } : u));
        this.messageService.add({ severity: 'success', summary: this.translate.instant(user.active ? 'admin.userDeactivated' : 'admin.userActivated') });
      },
      error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('admin.userToggleError') })
    });
  }

  confirmDeleteUser(user: AdminUser) {
    this.confirmationService.confirm({
      message: this.translate.instant('admin.deleteAccountConfirm', { name: user.name }),
      header: this.translate.instant('admin.deleteAccount'),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteUser(user)
    });
  }

  deleteUser(user: AdminUser) {
    this.http.delete(`${environment.apiUrl}/admin/users/${user.id}`).subscribe({
      next: () => {
        this.users.update(us => us.filter(u => u.id !== user.id));
        this.messageService.add({ severity: 'success', summary: this.translate.instant('admin.userDeleted') });
      },
      error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('admin.userDeleteError') })
    });
  }
}
