import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { Panel } from 'primeng/panel';
import { CustomerImportService, ImportJobResponse, ImportJobStatus } from '../../../core/services/customer-import.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { TagBadgeComponent, BadgeSeverity } from '../../../shared/components/tag-badge/tag-badge.component';
import { TableStandardDirective } from '../../../shared/directives/table-standard.directive';

const PAGE_SIZE = 20;

const STATUS_SEVERITY: Record<ImportJobStatus, BadgeSeverity> = {
  PENDING: 'secondary',
  PROCESSING: 'info',
  COMPLETED: 'success',
  COMPLETED_WITH_ERRORS: 'warn',
  FAILED: 'danger',
  CANCELLED: 'secondary',
};

/** Histórico de importações do tenant (issue #35 rework §15) — evita depender só da área
 *  persistente de progresso, que desaparece quando o utilizador a fecha. */
@Component({
  selector: 'app-customer-imports-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DatePipe, TranslatePipe, TableModule, Panel, EmptyStateComponent, PageHeaderComponent, TagBadgeComponent,
    TableStandardDirective],
  template: `
    <app-page-header [title]="'customers.import.history.title' | translate"
                      [breadcrumb]="[{ label: ('customers.title' | translate), route: '/customers' }]">
    </app-page-header>

    @if (!loading() && total() === 0) {
      <app-empty-state icon="pi pi-upload" [message]="'customers.import.history.empty' | translate"></app-empty-state>
    } @else {
      <p-panel>
        <div class="overflow-x-auto min-w-0">
          <p-table appTableStandard [value]="rows()" dataKey="id" [lazy]="true" [rows]="pageSize"
                   [totalRecords]="total()" [loading]="loading()" [showLoader]="false" [first]="first()"
                   (onLazyLoad)="onLazyLoad($event)">
            <ng-template pTemplate="header">
              <tr>
                <th>{{ 'customers.import.history.file' | translate }}</th>
                <th>{{ 'customers.import.history.date' | translate }}</th>
                <th class="text-right">{{ 'customers.import.history.records' | translate }}</th>
                <th class="text-right">{{ 'customers.import.history.imported' | translate }}</th>
                <th class="text-right">{{ 'customers.import.history.errors' | translate }}</th>
                <th>{{ 'customers.import.history.status' | translate }}</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-row>
              <tr class="cursor-pointer" (click)="openDetail(row)">
                <td class="font-medium text-app-text">{{ row.fileName }}</td>
                <td>{{ row.createdAt | date:'short' }}</td>
                <td class="text-right">{{ row.totalRows }}</td>
                <td class="text-right">{{ row.importedRows }}</td>
                <td class="text-right">{{ row.errorRows }}</td>
                <td>
                  <app-tag-badge [value]="('customers.import.history.status' + row.status) | translate"
                                 [severity]="statusSeverity(row.status)"></app-tag-badge>
                </td>
              </tr>
            </ng-template>
          </p-table>
        </div>
      </p-panel>
    }
  `,
})
export class CustomerImportsHistoryComponent {
  private customerImportService = inject(CustomerImportService);
  private router = inject(Router);

  readonly pageSize = PAGE_SIZE;

  rows = signal<ImportJobResponse[]>([]);
  total = signal(0);
  first = signal(0);
  loading = signal(false);

  constructor() {
    this.load(0);
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const first = event.first ?? 0;
    this.first.set(first);
    this.load(Math.floor(first / this.pageSize));
  }

  openDetail(row: ImportJobResponse): void {
    this.router.navigate(['/customers/imports', row.id]);
  }

  statusSeverity(status: ImportJobStatus): BadgeSeverity {
    return STATUS_SEVERITY[status];
  }

  private load(page: number): void {
    this.loading.set(true);
    this.customerImportService.getHistory(page, this.pageSize).subscribe({
      next: result => {
        this.loading.set(false);
        this.rows.set(result.content);
        this.total.set(result.page.totalElements);
      },
      error: () => this.loading.set(false),
    });
  }
}
