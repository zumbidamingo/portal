import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { ImageModule } from 'primeng/image';
import { ImageCompareModule } from 'primeng/imagecompare';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { Order, OrderEvidence, OrderService } from '../../../core/services/order.service';
import { LocalizedDatePipe } from '../../../shared/pipes/localized-date.pipe';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

/**
 * Evidências (upload é fluxo do app de campo, aqui só se vê) e a nota mais recente registada numa
 * transição (justificativa de suspensão/cancelamento/parcial) — não existe campo de "observações"
 * livre no domínio da Order, então não se inventa um aqui (CLAUDE.md regra 6).
 *
 * Comparação: com pelo menos duas fotos, o utilizador escolhe exatamente duas e abre um diálogo com
 * o p-imagecompare; dali pode trocar os lados, exportar a imagem ou gravá-la como nova evidência.
 * A composição é feita no servidor — o navegador não lê pixels das URLs assinadas do storage.
 */
@Component({
  selector: 'app-order-execution-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, LocalizedDatePipe, TranslatePipe, ImageModule, ImageCompareModule, ButtonModule,
    DialogModule, TooltipModule, EmptyStateComponent],
  template: `
    <div class="space-y-5 py-4">
      @if (lastNote(); as n) {
        <div>
          <div class="text-[11px] font-medium text-app-text-secondary mb-1">{{ 'orders.lastNoteHeader' | translate }}</div>
          <div class="text-sm text-app-text bg-app-surface-hover rounded-md p-3 italic">{{ n.note }}</div>
          <div class="text-xs text-app-text-tertiary mt-1">{{ n.occurredAt | localizedDate:'datetime':tenantTimezone() }}</div>
        </div>
      }

      <div>
        <div class="flex items-center justify-between gap-2 mb-2 min-h-8">
          <div class="text-[11px] font-medium text-app-text-secondary">{{ 'orders.evidencesHeader' | translate }}</div>
          @if (canStartComparison()) {
            @if (selecting()) {
              <div class="flex items-center gap-2">
                <span class="text-xs text-app-text-secondary">
                  {{ 'orders.compare.selectedCount' | translate:{ count: selectedIds().length } }}
                </span>
                <p-button [label]="'orders.compare.cancel' | translate" severity="secondary" [text]="true" size="small"
                          (onClick)="cancelSelection()"></p-button>
                <p-button [label]="'orders.compare.open' | translate" icon="pi pi-clone" size="small"
                          [disabled]="selectedIds().length !== 2" (onClick)="openComparison()"></p-button>
              </div>
            } @else {
              <p-button [label]="'orders.compare.start' | translate" icon="pi pi-clone" severity="secondary"
                        [outlined]="true" size="small" (onClick)="selecting.set(true)"></p-button>
            }
          }
        </div>
        @if (selecting()) {
          <p class="text-xs text-app-text-secondary mb-2">{{ 'orders.compare.hint' | translate }}</p>
        }
        @if (order().evidences.length === 0) {
          <app-empty-state icon="pi pi-images" [message]="'orders.emptyEvidences' | translate"></app-empty-state>
        } @else {
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            @for (e of order().evidences; track e.id) {
              <div class="relative rounded-md border overflow-hidden"
                   [class.border-app-border]="!isSelected(e.id)"
                   [class.border-primary]="isSelected(e.id)"
                   [class.ring-2]="isSelected(e.id)" [class.ring-primary]="isSelected(e.id)">
                @if (selecting() && e.type === 'PHOTO') {
                  <button type="button" class="absolute inset-0 z-10 cursor-pointer bg-transparent"
                          [attr.aria-pressed]="isSelected(e.id)"
                          [attr.aria-label]="'orders.compare.selectPhoto' | translate:{ n: photoNumber(e.id) }"
                          (click)="toggle(e.id)"></button>
                  <span class="absolute top-1.5 left-1.5 z-20 h-6 min-w-6 px-1 rounded-full text-xs font-semibold flex items-center justify-center pointer-events-none text-white"
                        [class.bg-primary]="isSelected(e.id)" [class.bg-black/50]="!isSelected(e.id)">
                    @if (isSelected(e.id)) { {{ selectedIds().indexOf(e.id) + 1 }} } @else { <i class="pi pi-plus text-[10px]"></i> }
                  </span>
                }
                <p-image [src]="e.url" [alt]="e.type" [preview]="!selecting()" appendTo="body"
                         imageClass="w-full h-24 object-cover" class="block [&_img]:w-full"></p-image>
                <div class="px-2 py-1 text-[11px] text-app-text-secondary flex items-center gap-1">
                  <i [class]="iconFor(e.type)"></i>
                  {{ ('orders.evidenceType.' + e.type) | translate }}
                  @if (e.type === 'PHOTO') { <span class="text-app-text-tertiary">#{{ photoNumber(e.id) }}</span> }
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>

    <p-dialog [visible]="dialogOpen()" (visibleChange)="onDialogVisible($event)" [modal]="true" [draggable]="false"
              [closable]="!busy()" [dismissableMask]="!busy()" appendTo="body"
              [style]="{ width: '56rem', maxWidth: '95vw' }"
              [header]="'orders.compare.title' | translate">
      @if (left(); as l) {
        @if (right(); as r) {
          <div class="space-y-3">
            <div class="flex items-center gap-2 text-xs">
              <div class="flex-1 min-w-0 rounded-md bg-app-surface-hover px-3 py-2">
                <div class="text-[10px] uppercase tracking-wide text-app-text-tertiary">{{ 'orders.compare.leftSide' | translate }}</div>
                <div class="font-medium text-app-text truncate">{{ photoLabel(l.id) }}
                  <span class="font-normal text-app-text-secondary">· {{ l.createdAt | localizedDate:'datetime':tenantTimezone() }}</span>
                </div>
              </div>
              <p-button icon="pi pi-arrow-right-arrow-left" severity="secondary" [outlined]="true" [rounded]="true"
                        [disabled]="!!busy()" (onClick)="swap()"
                        [pTooltip]="'orders.compare.swap' | translate" [attr.aria-label]="'orders.compare.swap' | translate"></p-button>
              <div class="flex-1 min-w-0 rounded-md bg-app-surface-hover px-3 py-2 text-right">
                <div class="text-[10px] uppercase tracking-wide text-app-text-tertiary">{{ 'orders.compare.rightSide' | translate }}</div>
                <div class="font-medium text-app-text truncate">{{ photoLabel(r.id) }}
                  <span class="font-normal text-app-text-secondary">· {{ r.createdAt | localizedDate:'datetime':tenantTimezone() }}</span>
                </div>
              </div>
            </div>

            <p-imagecompare class="block rounded-lg overflow-hidden border border-app-border [&_img]:w-full [&_img]:max-h-[60vh] [&_img]:object-contain">
              <ng-template #left><img [src]="l.url" [alt]="photoLabel(l.id)" /></ng-template>
              <ng-template #right><img [src]="r.url" [alt]="photoLabel(r.id)" /></ng-template>
            </p-imagecompare>
            <p class="text-xs text-app-text-secondary">{{ 'orders.compare.dragHint' | translate }}</p>
          </div>
        }
      }
      <ng-template #footer>
        <div class="flex flex-wrap justify-end gap-2">
          <p-button [label]="'orders.compare.close' | translate" severity="secondary" [text]="true"
                    [disabled]="!!busy()" (onClick)="closeDialog()"></p-button>
          <p-button [label]="'orders.compare.export' | translate" icon="pi pi-download" severity="secondary"
                    [outlined]="true" [loading]="busy() === 'export'" [disabled]="!!busy()" (onClick)="exportImage()"></p-button>
          <p-button [label]="'orders.compare.save' | translate" icon="pi pi-save"
                    [loading]="busy() === 'save'" [disabled]="!!busy()" (onClick)="saveAsEvidence()"></p-button>
        </div>
      </ng-template>
    </p-dialog>
  `,
})
export class OrderExecutionTabComponent {
  private orderService = inject(OrderService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  order = input.required<Order>();
  tenantTimezone = input<string | null>(null);
  /** Perfis com acesso ao endpoint de evidências; sem eles a ação de comparar nem aparece. */
  canCompare = input(false);
  /** Ordem com a comparação já gravada — o pai atualiza a lista sem recarregar. */
  orderUpdated = output<Order>();

  selecting = signal(false);
  selectedIds = signal<string[]>([]);
  dialogOpen = signal(false);
  leftId = signal<string | null>(null);
  rightId = signal<string | null>(null);
  busy = signal<'export' | 'save' | null>(null);

  lastNote = computed(() => {
    const withNote = this.order().transitions.filter(t => !!t.note);
    return withNote.length ? withNote[withNote.length - 1] : null;
  });

  private photos = computed(() => this.order().evidences.filter(e => e.type === 'PHOTO'));
  canStartComparison = computed(() => this.canCompare() && this.photos().length >= 2);

  left = computed(() => this.byId(this.leftId()));
  right = computed(() => this.byId(this.rightId()));

  iconFor(type: OrderEvidence['type']): string {
    return type === 'SIGNATURE' ? 'pi pi-pencil' : type === 'COMPARISON' ? 'pi pi-clone' : 'pi pi-camera';
  }

  photoNumber(id: string): number {
    return this.photos().findIndex(p => p.id === id) + 1;
  }

  photoLabel(id: string): string {
    return this.translate.instant('orders.compare.photoN', { n: this.photoNumber(id) });
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  /** Exatamente duas: escolher uma terceira substitui a mais antiga da seleção. */
  toggle(id: string): void {
    this.selectedIds.update(ids =>
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id].slice(-2));
  }

  cancelSelection(): void {
    this.selecting.set(false);
    this.selectedIds.set([]);
  }

  openComparison(): void {
    const [a, b] = this.selectedIds();
    if (!a || !b) return;
    this.leftId.set(a);
    this.rightId.set(b);
    this.dialogOpen.set(true);
  }

  swap(): void {
    const l = this.leftId();
    this.leftId.set(this.rightId());
    this.rightId.set(l);
  }

  onDialogVisible(visible: boolean): void {
    if (!visible) this.closeDialog();
  }

  closeDialog(): void {
    if (this.busy()) return;
    this.dialogOpen.set(false);
  }

  exportImage(): void {
    const req = this.request();
    if (!req) return;
    this.busy.set('export');
    this.orderService.exportEvidenceComparison(this.order().id, req).subscribe({
      next: blob => {
        this.busy.set(null);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `os-${this.order().orderNumber}-comparacao.jpg`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  saveAsEvidence(): void {
    const req = this.request();
    if (!req) return;
    this.busy.set('save');
    this.orderService.saveEvidenceComparison(this.order().id, req).subscribe({
      next: evidence => {
        this.busy.set(null);
        this.orderUpdated.emit({ ...this.order(), evidences: [...this.order().evidences, evidence] });
        this.messageService.add({ severity: 'success', summary: this.translate.instant('orders.compare.saved') });
        this.dialogOpen.set(false);
        this.cancelSelection();
      },
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  private request() {
    const l = this.leftId();
    const r = this.rightId();
    if (!l || !r) return null;
    return {
      leftEvidenceId: l, rightEvidenceId: r,
      leftLabel: this.photoLabel(l), rightLabel: this.photoLabel(r),
    };
  }

  private byId(id: string | null): OrderEvidence | null {
    return id ? this.order().evidences.find(e => e.id === id) ?? null : null;
  }

  private fail(err: HttpErrorResponse): void {
    this.busy.set(null);
    const code = (err.error as { errorCode?: string } | null)?.errorCode;
    const key = code ? `orders.errors.${code}` : '';
    const translated = key ? this.translate.instant(key) : key;
    this.messageService.add({
      severity: 'error',
      summary: key && translated !== key ? translated : this.translate.instant('orders.compare.error'),
    });
  }
}
