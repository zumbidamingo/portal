import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { ProgressBarModule } from 'primeng/progressbar';
import { Panel } from 'primeng/panel';
import { CustomerImportService, ImportJobErrorRow, ImportJobResponse, ImportJobStatus } from '../../../core/services/customer-import.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { TagBadgeComponent, BadgeSeverity } from '../../../shared/components/tag-badge/tag-badge.component';
import { customerImportErrorKey } from '../../../shared/utils/customer-import-error.util';
import { TableStandardDirective } from '../../../shared/directives/table-standard.directive';

const PAGE_SIZE = 50;
const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES: ImportJobStatus[] = ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED'];

const STATUS_SEVERITY: Record<ImportJobStatus, BadgeSeverity> = {
  PENDING: 'secondary',
  PROCESSING: 'info',
  COMPLETED: 'success',
  COMPLETED_WITH_ERRORS: 'warn',
  FAILED: 'danger',
  CANCELLED: 'secondary',
};

/**
 * Detalhe de uma importação (issue #35 rework §12/§15) — aberto tanto a partir do histórico
 * como do link "Ver detalhes" da área persistente de progresso. Faz o seu próprio polling leve
 * enquanto o job não estiver num estado terminal, independente do SSE da área persistente: um
 * utilizador pode abrir o link de um job que não é o que a área persistente está a acompanhar
 * (ex. reaberto a partir do histórico), por isso esta página não pode depender do estado dela.
 */
@Component({
  selector: 'app-customer-import-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslatePipe, TableModule, ProgressBarModule, Panel, PageHeaderComponent, TagBadgeComponent,
    TableStandardDirective],
  template: `
    <app-page-header [title]="'customers.import.detail.title' | translate"
                      [breadcrumb]="[
                        { label: ('customers.title' | translate), route: '/customers' },
                        { label: ('customers.import.history.title' | translate), route: '/customers/imports' }
                      ]">
    </app-page-header>

    @if (job(); as job) {
      <p-panel class="mb-6">
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <p class="font-medium text-app-text">{{ job.fileName }}</p>
            <app-tag-badge [value]="('customers.import.history.status' + job.status) | translate"
                           [severity]="statusSeverity(job.status)"></app-tag-badge>
          </div>
          <p-progressbar [value]="job.progress" [showValue]="true" class="h-2"></p-progressbar>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p class="text-app-text-tertiary text-xs">{{ 'customers.import.history.records' | translate }}</p>
              <p class="font-medium text-app-text">{{ job.totalRows }}</p>
            </div>
            <div>
              <p class="text-app-text-tertiary text-xs">{{ 'customers.import.tray.progress' | translate:{ processed: job.processedRows, total: job.totalRows } }}</p>
              <p class="font-medium text-app-text">{{ job.processedRows }}</p>
            </div>
            <div>
              <p class="text-app-text-tertiary text-xs">{{ 'customers.import.history.imported' | translate }}</p>
              <p class="font-medium text-app-success">{{ job.importedRows }}</p>
            </div>
            <div>
              <p class="text-app-text-tertiary text-xs">{{ 'customers.import.history.errors' | translate }}</p>
              <p class="font-medium text-app-danger">{{ job.errorRows }}</p>
            </div>
          </div>
          @if (job.errorMessage) {
            <p class="text-sm text-app-danger">{{ job.errorMessage }}</p>
          }
        </div>
      </p-panel>

      @if (job.errorRows > 0) {
        <p-panel [header]="'customers.import.detail.errorsTitle' | translate">
          <div class="overflow-x-auto min-w-0">
            <p-table appTableStandard [value]="errorRows()" [lazy]="true" [rows]="pageSize"
                     [totalRecords]="errorTotal()" [loading]="errorsLoading()" [showLoader]="false"
                     [first]="errorFirst()" (onLazyLoad)="onErrorsLazyLoad($event)">
              <ng-template pTemplate="header">
                <tr>
                  <th>{{ 'customers.import.line' | translate }}</th>
                  <th>{{ 'common.name' | translate }}</th>
                  <th>{{ 'customers.taxId' | translate }}</th>
                  <th>{{ 'customers.import.errorColumn' | translate }}</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-row>
                <tr>
                  <td>{{ row.line }}</td>
                  <td>{{ row.rawName ?? '—' }}</td>
                  <td>{{ row.rawTaxId ?? '—' }}</td>
                  <td class="text-app-danger text-xs">{{ errorMessage(row) }}</td>
                </tr>
              </ng-template>
            </p-table>
          </div>
        </p-panel>
      } @else if (!loading()) {
        <p class="text-sm text-app-text-secondary">{{ 'customers.import.detail.noErrors' | translate }}</p>
      }
    }
  `,
})
export class CustomerImportDetailComponent implements OnInit, OnDestroy {
  private customerImportService = inject(CustomerImportService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private translate = inject(TranslateService);

  readonly pageSize = PAGE_SIZE;

  job = signal<ImportJobResponse | null>(null);
  loading = signal(false);

  errorRows = signal<ImportJobErrorRow[]>([]);
  errorTotal = signal(0);
  errorFirst = signal(0);
  errorsLoading = signal(false);

  private importId!: string;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.importId = this.route.snapshot.paramMap.get('id')!;
    this.loadJob();
    this.loadErrors(0);
    this.destroyRef.onDestroy(() => this.stopPolling());
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  onErrorsLazyLoad(event: TableLazyLoadEvent): void {
    const first = event.first ?? 0;
    this.errorFirst.set(first);
    this.loadErrors(Math.floor(first / this.pageSize));
  }

  statusSeverity(status: ImportJobStatus): BadgeSeverity {
    return STATUS_SEVERITY[status];
  }

  /** Traduz o código de erro da linha (util partilhado com o preview síncrono) — o backend nunca
   *  devolve `errorMessage` já traduzido, só cai no texto em bruto para códigos desconhecidos. */
  errorMessage(row: ImportJobErrorRow): string {
    const key = customerImportErrorKey(row.errorCode);
    return key ? this.translate.instant(key) : row.errorMessage;
  }

  private loadJob(): void {
    this.loading.set(true);
    this.customerImportService.getJob(this.importId).subscribe({
      next: job => {
        this.loading.set(false);
        this.job.set(job);
        if (TERMINAL_STATUSES.includes(job.status)) {
          this.stopPolling();
        } else {
          this.startPolling();
        }
      },
      error: () => this.loading.set(false),
    });
  }

  private startPolling(): void {
    if (this.pollTimer) {
      return;
    }
    this.pollTimer = setInterval(() => {
      this.customerImportService.getJob(this.importId).subscribe({
        next: job => {
          this.job.set(job);
          if (TERMINAL_STATUSES.includes(job.status)) {
            this.stopPolling();
            this.loadErrors(0);
          }
        },
      });
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private loadErrors(page: number): void {
    this.errorsLoading.set(true);
    this.customerImportService.getErrors(this.importId, page, this.pageSize).subscribe({
      next: result => {
        this.errorsLoading.set(false);
        this.errorRows.set(result.content);
        this.errorTotal.set(result.page.totalElements);
      },
      error: () => this.errorsLoading.set(false),
    });
  }
}
