import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { TagModule } from 'primeng/tag';
import type { BadgeSeverity } from '../../utils/status.utils';

export type { BadgeSeverity };

/**
 * Standardised tag/badge for consistent display across the Portal.
 *
 * Usage:
 *   <app-tag-badge [value]="'Urgent'" severity="danger"></app-tag-badge>
 *   <app-tag-badge [value]="'jobs.urgent' | translate" severity="danger"></app-tag-badge>
 *   <app-tag-badge [value]="'jobs.statusOpen' | translate" [severity]="statusSeverity(job.status)"></app-tag-badge>
 */
@Component({
  selector: 'app-tag-badge',
  standalone: true,
  imports: [CommonModule, TagModule],
  template: `
    <!-- $any: 'primary' é uma variante real no preset do tema (app.config.ts) — a p-tag do
         PrimeNG aceita a classe em runtime, só o tipo declarado do componente não lista. -->
    <p-tag [value]="value" [severity]="$any(severity)" class="tag-badge"></p-tag>
  `,
  // Every declaration is flagged `!important` on purpose. PrimeNG 21 injects its
  // theme stylesheet at runtime, so whether the theme rule (`.p-tag { font-weight: 700 }`)
  // or this component's rule wins depends on which <style> lands in <head> last —
  // which differs between a warm navigation and a hard reload. Without `!important`
  // the badge renders bold right after a force refresh and light afterwards.
  styles: [`
    ::ng-deep .tag-badge {
      font-size: 0.75rem !important;
      line-height: 1rem !important;
      padding: 0.375rem 0.5rem !important;
      border-radius: 9999px !important;
      font-weight: 500 !important;
    }
  `],
})
export class TagBadgeComponent {
  @Input() value: string = '';
  @Input() severity: BadgeSeverity = 'info';
}
