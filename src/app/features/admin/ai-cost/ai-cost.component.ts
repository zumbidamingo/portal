import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TableModule } from 'primeng/table';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

interface AiCostRow {
  tenantId: string;
  tenantName: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  credits: number;
  costUsd: number;
}

interface AiCostReport {
  since: string;
  totalCostUsd: number;
  tenants: AiCostRow[];
}

/**
 * Custo de IA por tenant no mês corrente (issue #131) — dado da plataforma: o custo em dólares é da
 * SuaOperacao e o tenant só vê créditos. Vem de `GET /admin/intelligence/cost` (só PLATFORM_ADMIN);
 * o total e a ordenação por custo já chegam calculados.
 */
@Component({
  selector: 'app-ai-cost',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslatePipe, DecimalPipe, TableModule, EmptyStateComponent],
  template: `
    <div class="space-y-4 pt-3">
      @if (report(); as r) {
        <p class="text-sm text-app-text-secondary">
          {{ 'admin.aiCost.since' | translate }} {{ r.since }} —
          <span class="font-semibold text-app-text">{{ 'admin.aiCost.total' | translate }}: US$ {{ r.totalCostUsd | number: '1.2-4' }}</span>
        </p>
        @if (r.tenants.length === 0) {
          <app-empty-state icon="pi pi-chart-bar" [message]="'admin.aiCost.empty' | translate"></app-empty-state>
        } @else {
          <p-table [value]="r.tenants" styleClass="p-datatable-sm">
            <ng-template pTemplate="header">
              <tr>
                <th>{{ 'admin.aiCost.tenant' | translate }}</th>
                <th class="text-right">{{ 'admin.aiCost.calls' | translate }}</th>
                <th class="text-right">{{ 'admin.aiCost.tokens' | translate }}</th>
                <th class="text-right">{{ 'admin.aiCost.credits' | translate }}</th>
                <th class="text-right">{{ 'admin.aiCost.cost' | translate }}</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-row>
              <tr>
                <td class="font-medium text-app-text">{{ row.tenantName }}</td>
                <td class="text-right">{{ row.calls | number }}</td>
                <td class="text-right">{{ row.inputTokens + row.outputTokens | number }}</td>
                <td class="text-right">{{ row.credits | number }}</td>
                <td class="text-right">US$ {{ row.costUsd | number: '1.2-4' }}</td>
              </tr>
            </ng-template>
          </p-table>
        }
      }
    </div>
  `,
})
export class AiCostComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);

  report = signal<AiCostReport | null>(null);

  ngOnInit() {
    this.http.get<AiCostReport>(`${environment.apiUrl}/admin/intelligence/cost`, { params: new HttpParams() }).subscribe({
      next: r => this.report.set(r),
      error: () => this.messages.add({ severity: 'error', summary: this.translate.instant('admin.aiCost.loadError') }),
    });
  }
}
