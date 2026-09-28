import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PanelModule } from 'primeng/panel';
import { ToastModule } from 'primeng/toast';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ChecklistConfig, ChecklistItem, ChecklistService } from '../../../core/services/checklist.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { TagBadgeComponent } from '../../../shared/components/tag-badge/tag-badge.component';

const MAX_LABEL = 120;

/**
 * Checklist que o técnico confere na execução da ordem, definido pela empresa. Duas coisas
 * ficam separadas de propósito: a **lista do técnico** (o que é do tenant — itens próprios e
 * sugestões que ele aceitou, editáveis, ordenáveis e com liga/desliga) e as **sugestões do
 * sistema** (pontos de partida que ainda não são de ninguém até serem adicionadas).
 *
 * Cada ação grava na hora e a tela relê o servidor — não há botão "Salvar" que possa ficar
 * esquecido. O app de campo lê só os itens ativos, na ordem mostrada aqui.
 */
@Component({
  selector: 'app-checklist',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe, ButtonModule, InputTextModule, PanelModule, ToastModule,
    ToggleSwitchModule, TooltipModule, ConfirmDialogModule, PageHeaderComponent, TagBadgeComponent],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast position="top-right"></p-toast>
    <p-confirmDialog [style]="{ width: '26rem' }"></p-confirmDialog>

    <div class="max-w-2xl space-y-6">
      <app-page-header [title]="'checklist.title' | translate" [description]="'checklist.subtitle' | translate"
                       [breadcrumb]="[{ label: 'nav.administration' | translate, route: '/administration' }]"></app-page-header>

      @if (loadError()) {
        <div class="flex flex-col items-center py-12 text-center">
          <i class="pi pi-exclamation-triangle text-2xl text-app-danger mb-3" aria-hidden="true"></i>
          <p class="text-sm font-medium text-app-text">{{ 'checklist.loadError' | translate }}</p>
          <p-button [label]="'common.retry' | translate" [text]="true" size="small" class="mt-2" (onClick)="load()"></p-button>
        </div>
      } @else if (config(); as cfg) {

        <!-- Lista do técnico -->
        <p-panel>
          <ng-template #header>
            <div class="flex items-center gap-2">
              <span class="font-semibold text-app-text">{{ 'checklist.listTitle' | translate }}</span>
              <span class="text-xs text-app-text-tertiary">
                {{ 'checklist.activeCount' | translate: { active: activeCount(), total: cfg.items.length } }}
              </span>
            </div>
          </ng-template>

          <p class="text-sm text-app-text-secondary mb-3">{{ 'checklist.listHint' | translate }}</p>

          @if (cfg.items.length === 0) {
            <div class="rounded-md border border-dashed border-app-border px-4 py-6 text-center">
              <i class="pi pi-list-check text-2xl text-app-text-tertiary mb-2 block" aria-hidden="true"></i>
              <p class="text-sm font-medium text-app-text">{{ 'checklist.emptyTitle' | translate }}</p>
              <p class="text-xs text-app-text-tertiary mt-1">{{ 'checklist.emptySubtitle' | translate }}</p>
            </div>
          } @else {
            <ul class="divide-y divide-app-border border-y border-app-border">
              @for (item of cfg.items; track item.id; let i = $index; let first = $first; let last = $last) {
                <li class="flex items-center gap-2 py-2" [class.opacity-60]="!item.active">
                  <div class="flex flex-col shrink-0">
                    <p-button icon="pi pi-chevron-up" [text]="true" size="small" severity="secondary"
                              [disabled]="first || busy()" [attr.aria-label]="'checklist.moveUp' | translate"
                              (onClick)="move(i, -1)"></p-button>
                    <p-button icon="pi pi-chevron-down" [text]="true" size="small" severity="secondary"
                              [disabled]="last || busy()" [attr.aria-label]="'checklist.moveDown' | translate"
                              (onClick)="move(i, 1)"></p-button>
                  </div>

                  <div class="min-w-0 flex-1">
                    @if (editingId() === item.id) {
                      <input pInputText fluid [formControl]="editControl" [maxlength]="maxLabel" autocomplete="off"
                             [attr.aria-label]="'checklist.itemText' | translate"
                             (keydown.enter)="saveEdit(item)" (keydown.escape)="cancelEdit()" />
                    } @else {
                      <p class="text-sm text-app-text break-words">{{ item.label }}</p>
                      <app-tag-badge class="mt-0.5 inline-block"
                                     [value]="(item.source === 'SUGGESTED' ? 'checklist.sourceSuggested' : 'checklist.sourceCustom') | translate"
                                     [severity]="item.source === 'SUGGESTED' ? 'info' : 'secondary'"></app-tag-badge>
                    }
                  </div>

                  <div class="flex items-center gap-1 shrink-0">
                    @if (editingId() === item.id) {
                      <p-button icon="pi pi-check" [text]="true" size="small" severity="success"
                                [disabled]="editControl.invalid || busy()" [pTooltip]="'common.save' | translate"
                                [attr.aria-label]="'common.save' | translate" (onClick)="saveEdit(item)"></p-button>
                      <p-button icon="pi pi-times" [text]="true" size="small" severity="secondary"
                                [pTooltip]="'common.cancel' | translate" [attr.aria-label]="'common.cancel' | translate"
                                (onClick)="cancelEdit()"></p-button>
                    } @else {
                      <p-toggleswitch [formControl]="toggleControl(item)"
                                      [pTooltip]="(item.active ? 'checklist.hideFromTechnician' : 'checklist.showToTechnician') | translate"
                                      [attr.aria-label]="(item.active ? 'checklist.hideFromTechnician' : 'checklist.showToTechnician') | translate"
                                      (onChange)="toggle(item)"></p-toggleswitch>
                      <p-button icon="pi pi-pencil" [text]="true" size="small" severity="secondary"
                                [disabled]="busy()" [pTooltip]="'common.edit' | translate"
                                [attr.aria-label]="'common.edit' | translate" (onClick)="startEdit(item)"></p-button>
                      <p-button icon="pi pi-trash" [text]="true" size="small" severity="danger"
                                [disabled]="busy()" [pTooltip]="'checklist.remove' | translate"
                                [attr.aria-label]="'checklist.remove' | translate" (onClick)="confirmRemove(item)"></p-button>
                    }
                  </div>
                </li>
              }
            </ul>
          }

          <!-- Adicionar item próprio -->
          <div class="mt-4">
            <label class="label" for="new-checklist-item">{{ 'checklist.addLabel' | translate }}</label>
            <div class="flex gap-2">
              <input id="new-checklist-item" pInputText fluid [formControl]="newControl" [maxlength]="maxLabel"
                     [placeholder]="'checklist.addPlaceholder' | translate" autocomplete="off"
                     [disabled]="atLimit()" (keydown.enter)="add()" />
              <p-button icon="pi pi-plus" [label]="'checklist.add' | translate" class="shrink-0"
                        [disabled]="newControl.invalid || busy() || atLimit()" (onClick)="add()"></p-button>
            </div>
            @if (atLimit()) {
              <small class="text-app-text-tertiary text-[11px] mt-1 block">
                {{ 'checklist.limitReached' | translate: { max: cfg.maxItems } }}
              </small>
            }
          </div>

          <p class="text-[11px] text-app-text-tertiary pt-3 mt-4 border-t border-app-border leading-tight">
            {{ 'checklist.footerNote' | translate }}
          </p>
        </p-panel>

        <!-- Sugestões do sistema -->
        @if (cfg.suggestions.length > 0) {
          <p-panel>
            <ng-template #header>
              <div class="flex items-center justify-between gap-3 w-full">
                <span class="font-semibold text-app-text">{{ 'checklist.suggestionsTitle' | translate }}</span>
                <p-button [label]="'checklist.addAll' | translate" icon="pi pi-plus" [text]="true" size="small"
                          [disabled]="busy() || atLimit()" (onClick)="acceptAll()"></p-button>
              </div>
            </ng-template>
            <p class="text-sm text-app-text-secondary mb-3">{{ 'checklist.suggestionsHint' | translate }}</p>
            <ul class="divide-y divide-app-border border-y border-app-border">
              @for (s of cfg.suggestions; track s.code) {
                <li class="flex items-center gap-2 py-2">
                  <p class="min-w-0 flex-1 text-sm text-app-text break-words">{{ s.label }}</p>
                  <p-button [label]="'checklist.addOne' | translate" icon="pi pi-plus" size="small" [outlined]="true"
                            [disabled]="busy() || atLimit()" (onClick)="accept(s.code)"></p-button>
                  <p-button icon="pi pi-times" [text]="true" size="small" severity="secondary" [disabled]="busy()"
                            [pTooltip]="'checklist.dismiss' | translate" [attr.aria-label]="'checklist.dismiss' | translate"
                            (onClick)="dismiss(s.code)"></p-button>
                </li>
              }
            </ul>
          </p-panel>
        }

        <!-- Sugestões ignoradas -->
        @if (cfg.dismissedSuggestions.length > 0) {
          <div>
            <p-button [label]="(showDismissed() ? 'checklist.hideDismissed' : 'checklist.showDismissed') | translate: { count: cfg.dismissedSuggestions.length }"
                      [icon]="showDismissed() ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" [text]="true" size="small"
                      severity="secondary" (onClick)="showDismissed.set(!showDismissed())"></p-button>
            @if (showDismissed()) {
              <ul class="divide-y divide-app-border border-y border-app-border mt-2">
                @for (s of cfg.dismissedSuggestions; track s.code) {
                  <li class="flex items-center gap-2 py-2">
                    <p class="min-w-0 flex-1 text-sm text-app-text-secondary break-words">{{ s.label }}</p>
                    <p-button [label]="'checklist.restore' | translate" icon="pi pi-undo" size="small" [text]="true"
                              [disabled]="busy()" (onClick)="restore(s.code)"></p-button>
                  </li>
                }
              </ul>
            }
          </div>
        }
      } @else {
        <div class="flex flex-col items-center py-12 text-app-text-tertiary">
          <i class="pi pi-spin pi-spinner text-2xl mb-3" aria-hidden="true"></i>
          <p class="text-sm">{{ 'common.loading' | translate }}</p>
        </div>
      }
    </div>
  `,
})
export class ChecklistComponent implements OnInit {
  private service = inject(ChecklistService);
  private translate = inject(TranslateService);
  private messages = inject(MessageService);
  private confirmation = inject(ConfirmationService);

  readonly maxLabel = MAX_LABEL;
  readonly config = signal<ChecklistConfig | null>(null);
  readonly loadError = signal(false);
  readonly busy = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly showDismissed = signal(false);

  readonly newControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(MAX_LABEL)],
  });
  readonly editControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(MAX_LABEL)],
  });

  readonly activeCount = computed(() => this.config()?.items.filter(i => i.active).length ?? 0);
  readonly atLimit = computed(() => {
    const cfg = this.config();
    return !!cfg && cfg.items.length >= cfg.maxItems;
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loadError.set(false);
    this.service.get().subscribe({
      next: cfg => {
        this.syncToggles(cfg);
        this.config.set(cfg);
      },
      error: () => this.loadError.set(true),
    });
  }

  add(): void {
    const label = this.newControl.value.trim();
    if (this.newControl.invalid || this.busy()) return;
    this.run(this.service.create(label), () => this.newControl.reset(''));
  }

  accept(code: string): void {
    this.run(this.service.acceptSuggestion(code));
  }

  acceptAll(): void {
    this.run(this.service.acceptAllSuggestions());
  }

  dismiss(code: string): void {
    this.run(this.service.dismissSuggestion(code));
  }

  restore(code: string): void {
    this.run(this.service.restoreSuggestion(code));
  }

  /** Um controle por item, criado uma vez e só realinhado ao servidor a cada leitura. */
  private readonly toggles = new Map<string, FormControl<boolean>>();

  toggleControl(item: ChecklistItem): FormControl<boolean> {
    let control = this.toggles.get(item.id);
    if (!control) {
      control = new FormControl(item.active, { nonNullable: true });
      this.toggles.set(item.id, control);
    }
    return control;
  }

  private syncToggles(cfg: ChecklistConfig): void {
    const ids = new Set(cfg.items.map(i => i.id));
    for (const id of [...this.toggles.keys()]) {
      if (!ids.has(id)) this.toggles.delete(id);
    }
    for (const item of cfg.items) {
      this.toggleControl(item).setValue(item.active, { emitEvent: false });
    }
  }

  /** O switch já virou ao clique; o valor novo é o do controle, não o inverso do que veio do servidor. */
  toggle(item: ChecklistItem): void {
    const control = this.toggleControl(item);
    if (this.busy()) {
      control.setValue(item.active, { emitEvent: false });
      return;
    }
    this.run(this.service.setActive(item.id, control.value));
  }

  startEdit(item: ChecklistItem): void {
    this.editControl.setValue(item.label);
    this.editingId.set(item.id);
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  saveEdit(item: ChecklistItem): void {
    if (this.editControl.invalid || this.busy()) return;
    const label = this.editControl.value.trim();
    if (label === item.label) {
      this.cancelEdit();
      return;
    }
    this.run(this.service.rename(item.id, label), () => this.editingId.set(null));
  }

  move(index: number, delta: -1 | 1): void {
    const items = this.config()?.items;
    if (!items || this.busy()) return;
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const ids = items.map(i => i.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    this.run(this.service.reorder(ids));
  }

  confirmRemove(item: ChecklistItem): void {
    this.confirmation.confirm({
      header: this.translate.instant('checklist.removeTitle'),
      message: this.translate.instant(
        item.source === 'SUGGESTED' ? 'checklist.removeSuggestedConfirm' : 'checklist.removeCustomConfirm',
        { text: item.label }),
      icon: 'pi pi-trash',
      acceptLabel: this.translate.instant('checklist.remove'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger', size: 'small' },
      rejectButtonProps: { severity: 'secondary', outlined: true, size: 'small' },
      accept: () => this.run(this.service.remove(item.id)),
    });
  }

  /** Executa uma mudança e relê o servidor; falha mostra a razão de negócio quando há tradução. */
  private run(action: Observable<unknown>, onSuccess?: () => void): void {
    this.busy.set(true);
    action.subscribe({
      next: () => {
        onSuccess?.();
        this.busy.set(false);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.messages.add({ severity: 'error', summary: this.errorMessage(err), life: 5000 });
        this.load();
      },
    });
  }

  private errorMessage(err: HttpErrorResponse): string {
    const code = (err.error as { errorCode?: string } | null)?.errorCode;
    if (err.status === 422 && code) {
      const key = `checklist.errors.${code}`;
      const translated = this.translate.instant(key);
      if (translated !== key) return translated;
    }
    return this.translate.instant('checklist.saveError');
  }
}
