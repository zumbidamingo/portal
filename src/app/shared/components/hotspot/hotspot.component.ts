import { Component, Input } from '@angular/core';

/**
 * A small pulsing dot for feature discovery. Purely decorative — the parent
 * positions it (absolute/relative) next to the control it hints at.
 */
@Component({
  selector: 'app-hotspot',
  standalone: true,
  template: `
    <span class="rf-hotspot" [style.width.px]="size" [style.height.px]="size" aria-hidden="true">
      <span class="rf-hotspot__ping" [style.background]="color"></span>
      <span class="rf-hotspot__dot" [style.background]="color"></span>
    </span>
  `,
  styles: [`
    .rf-hotspot { position: relative; display: inline-flex; }
    .rf-hotspot__ping, .rf-hotspot__dot {
      position: absolute; inset: 0; border-radius: 9999px;
    }
    .rf-hotspot__ping { opacity: .65; animation: rf-hotspot-ping 1.6s cubic-bezier(0,0,.2,1) infinite; }
    .rf-hotspot__dot { transform: scale(.55); }
    @keyframes rf-hotspot-ping {
      0%   { transform: scale(.6); opacity: .7; }
      80%, 100% { transform: scale(1.8); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .rf-hotspot__ping { animation: none; opacity: .35; }
    }
  `]
})
export class HotspotComponent {
  @Input() size = 14;
  @Input() color = 'var(--app-accent)';
}
