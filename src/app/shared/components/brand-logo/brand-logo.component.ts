import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ThemeService } from '../../../core/services/theme.service';

export type BrandLogoVariant = 'wordmark' | 'symbol' | 'lockup-vertical';
export type BrandLogoTone = 'auto' | 'color' | 'mono-ink' | 'mono-white';

/**
 * Logo da marca (docs/brand — Guia de Marca). Desenhado em HTML/CSS com a Figtree já carregada:
 * os SVGs do pacote têm texto vivo e dependem da fonte, por isso não entram como `<img>`.
 *
 * `size` é a altura em px: o corpo do wordmark ou o lado do símbolo. `auto` segue o tema do
 * portal: versão colorida no claro, menta + #EDEDED e símbolo em grafite no escuro.
 */
@Component({
  selector: 'app-brand-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'img',
    'aria-label': 'Sua Operação',
    '[class]': 'hostClass()',
    '[style.--bl-size.px]': 'size()',
  },
  template: `
    @if (variant() !== 'wordmark') {
      <span class="bl-symbol" aria-hidden="true">s@if (showSymbolDot()) {<span class="bl-dot">.</span>}</span>
    }
    @if (variant() !== 'symbol') {
      <span class="bl-wordmark" aria-hidden="true"><span class="bl-sua">sua</span><span class="bl-op">operação</span><span class="bl-dot">.</span></span>
    }
  `,
  styleUrl: './brand-logo.component.css',
})
export class BrandLogoComponent {
  private readonly theme = inject(ThemeService);

  readonly variant = input<BrandLogoVariant>('wordmark');
  readonly tone = input<BrandLogoTone>('auto');
  readonly size = input(24);

  /** Abaixo de 24 px o ponto do símbolo sai (Guia de Marca §02). */
  protected readonly showSymbolDot = computed(() => this.size() >= 24);

  protected readonly hostClass = computed(() => {
    const tone = this.tone() === 'auto' ? (this.theme.resolved() === 'dark' ? 'dark' : 'color') : this.tone();
    return `bl bl-${this.variant()} bl-tone-${tone}`;
  });
}
