import { Component, Input } from '@angular/core';

export interface BreadcrumbItem {
  label: string;
  /** Ausente no último item — a página atual não navega para si mesma. */
  action?: () => void;
}

/**
 * Trilha de navegação simples para telas de detalhe/edição (ex: "Orçamentos > Editor de orçamento").
 * Reutilizar em vez de recriar links ad-hoc sempre que uma feature ganhar uma vista de detalhe.
 */
@Component({
  selector: 'app-breadcrumb',
  standalone: true,
  template: `
    <nav class="flex items-center flex-wrap gap-1.5 text-sm" aria-label="breadcrumb">
      @for (item of items; track $index) {
        @if (!$last && item.action) {
          <button type="button" class="text-app-text-secondary hover:text-app-text transition-colors cursor-pointer"
                  (click)="item.action!()">{{ item.label }}</button>
        } @else {
          <span class="text-app-text font-medium" [attr.aria-current]="$last ? 'page' : null">{{ item.label }}</span>
        }
        @if (!$last) {
          <i class="pi pi-angle-right text-[10px] text-app-text-tertiary" aria-hidden="true"></i>
        }
      }
    </nav>
  `
})
export class BreadcrumbComponent {
  @Input() items: BreadcrumbItem[] = [];
}
