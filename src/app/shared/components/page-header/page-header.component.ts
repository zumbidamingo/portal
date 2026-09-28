import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface Breadcrumb {
  label: string;
  route: string;
}

/**
 * Cabeçalho padrão de página: trilha de navegação opcional, título, descrição opcional e slot
 * de ações à direita. Reutilizar em vez de recriar `<h1>`/`<p>` ad-hoc em cada feature.
 *
 * `breadcrumb` leva só os ancestrais (já traduzidos pelo chamador, como `title`/`description`).
 * A página atual não aparece como texto na trilha — o `title` logo abaixo já a mostra, maior e
 * em destaque; repeti-la ali seria a mesma informação duas vezes na mesma tela. O `title` só
 * entra na trilha como texto para leitor de tela (`sr-only`), para a lista de breadcrumb ficar
 * semanticamente completa sem duplicar nada visualmente.
 */
@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="flex flex-wrap items-start justify-between gap-4 mb-8">
      <div class="min-w-0">
        @if (breadcrumb.length) {
          <nav class="flex items-center gap-1.5 text-xs text-app-text-tertiary mb-1.5 flex-wrap" aria-label="Breadcrumb">
            @for (crumb of breadcrumb; track crumb.route) {
              <a [routerLink]="crumb.route" class="hover:text-app-text hover:underline">{{ crumb.label }}</a>
              <i class="pi pi-angle-right text-[10px]"></i>
            }
            <span class="sr-only">{{ title }}</span>
          </nav>
        }
        <div class="flex items-center gap-2.5 flex-wrap">
          <h1 class="text-[26px] font-semibold leading-8 text-app-text break-words">{{ title }}</h1>
          <ng-content select="[badge]"></ng-content>
        </div>
        @if (description) {
          <p class="text-sm text-app-text-secondary mt-1">{{ description }}</p>
        }
      </div>
      <div class="flex items-center flex-wrap gap-2">
        <ng-content></ng-content>
      </div>
    </div>
  `
})
export class PageHeaderComponent {
  @Input() title = '';
  @Input() description?: string;
  @Input() breadcrumb: Breadcrumb[] = [];
}
