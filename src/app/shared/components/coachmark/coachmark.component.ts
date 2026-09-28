import {
  Component, Input, Output, EventEmitter, AfterViewInit, OnChanges, SimpleChanges, OnDestroy,
  signal, computed, inject, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';

/**
 * A contextual coachmark: highlights a real on-screen control (found by CSS
 * selector) with a ring and shows a bubble with copy + Next/Skip beside it.
 * Non-blocking (no backdrop), follows the target on scroll/resize. Built on
 * getBoundingClientRect — no CDK dependency (PrimeNG 21 doesn't ship it).
 */
@Component({
  selector: 'app-coachmark',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  template: `
    @if (rect(); as r) {
      <!--
        Spotlight: four blurred panels around the target leave it sharp and clickable.
        They swallow clicks without dismissing, so the tour ends only through an
        explicit choice — the primary action, Skip, or the highlighted target itself.
      -->
      @if (backdrop) {
        @for (m of mask(); track $index) {
          <div class="rf-cm-mask"
               [style.left.px]="m.left" [style.top.px]="m.top"
               [style.width.px]="m.width" [style.height.px]="m.height"></div>
        }
      }

      <!-- Highlight ring around the target -->
      <div class="rf-cm-ring" [style.left.px]="r.left - 6" [style.top.px]="r.top - 6"
           [style.width.px]="r.width + 12" [style.height.px]="r.height + 12"></div>

      <!-- Bubble -->
      <div class="rf-cm-bubble" [class.rf-cm-bubble--above]="placeAbove()"
           [style.left.px]="bubbleLeft()" [style.top.px]="bubbleTop()">
        @if (stepLabel) {
          <span class="text-[11px] font-semibold text-app-accent-hover uppercase tracking-wider">{{ stepLabel }}</span>
        }
        <p class="font-semibold text-app-text mt-0.5">{{ title }}</p>
        <p class="text-sm text-app-text-secondary mt-1 leading-snug">{{ body }}</p>
        <div class="flex items-center justify-between gap-2 mt-4">
          <button type="button" (click)="skip.emit()"
                  class="text-xs text-app-text-tertiary hover:text-app-text-secondary">{{ skipLabel }}</button>
          <div class="flex items-center gap-2">
            @if (backLabel) {
              <p-button size="small" [label]="backLabel" [outlined]="true" (onClick)="back.emit()"></p-button>
            }
            <p-button size="small" [label]="primaryLabel" (onClick)="primary.emit()"></p-button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .rf-cm-mask {
      position: fixed; z-index: 1090;
      background: var(--app-scrim);
      backdrop-filter: blur(3px);
      -webkit-backdrop-filter: blur(3px);
    }
    .rf-cm-ring {
      position: fixed; z-index: 1100; pointer-events: none;
      border: 2px solid var(--app-accent); border-radius: 12px;
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--app-accent) 25%, transparent);
      transition: all .18s ease-out;
    }
    .rf-cm-bubble {
      position: fixed; z-index: 1101; width: 280px; max-width: calc(100vw - 24px);
      background: var(--app-bg); color: var(--app-text); border: 1px solid var(--app-border); border-radius: 12px; padding: 16px;
            transition: all .18s ease-out;
    }
  `]
})
export class CoachmarkComponent implements AfterViewInit, OnChanges, OnDestroy {
  private zone = inject(NgZone);

  @Input() targetSelector = '';
  @Input() title = '';
  @Input() body = '';
  @Input() primaryLabel = '';
  @Input() skipLabel = '';
  @Input() stepLabel?: string;
  /** Absent/empty hides the button — only steps past the first offer it. */
  @Input() backLabel?: string | null;
  /** Blur + dim everything except the target, so only the tour is in focus. */
  @Input() backdrop = true;

  @Output() primary = new EventEmitter<void>();
  @Output() skip = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();

  readonly rect = signal<DOMRect | null>(null);
  private readonly viewport = signal({ w: window.innerWidth, h: window.innerHeight });

  /**
   * Four panels framing the target. A single overlay with a CSS hole can't blur
   * its backdrop, so the cut-out is made by leaving the target rect uncovered —
   * which also keeps it sharp and clickable.
   */
  readonly mask = computed(() => {
    const r = this.rect();
    if (!r) return [];
    const { w, h } = this.viewport();
    const pad = 6;
    const top = Math.max(0, r.top - pad);
    const bottom = Math.min(h, r.bottom + pad);
    const left = Math.max(0, r.left - pad);
    const right = Math.min(w, r.right + pad);
    const bandHeight = Math.max(0, bottom - top);
    return [
      { left: 0, top: 0, width: w, height: top },
      { left: 0, top: bottom, width: w, height: Math.max(0, h - bottom) },
      { left: 0, top, width: left, height: bandHeight },
      { left: right, top, width: Math.max(0, w - right), height: bandHeight },
    ];
  });
  readonly placeAbove = computed(() => {
    const r = this.rect();
    return !!r && r.bottom + 180 > window.innerHeight;
  });
  readonly bubbleLeft = computed(() => {
    const r = this.rect();
    if (!r) return 0;
    return Math.max(12, Math.min(r.left, window.innerWidth - 292));
  });
  readonly bubbleTop = computed(() => {
    const r = this.rect();
    if (!r) return 0;
    return this.placeAbove() ? r.top - 168 : r.bottom + 12;
  });

  private timer?: number;
  private readonly reflow = () => this.zone.run(() => this.measure());

  /**
   * Consecutive `measure()` calls that failed to find the target. In-page
   * targets (job cards, apply buttons — unlike sidebar items) legitimately
   * disappear for a few hundred ms mid-transition: the outgoing route's DOM
   * is torn down at once, and the incoming page renders its content only
   * after data loads. Hiding on the first miss made the whole coachmark
   * blink out and back at data-dependent moments. Instead the last rect is
   * held through the grace window so the overlay stays continuously visible
   * and slides to the new target; only a persistent absence hides it.
   */
  private misses = 0;
  /** ~2s at the 250ms poll before a missing target actually hides the overlay. */
  private static readonly MISS_GRACE = 8;

  ngAfterViewInit(): void {
    this.measure();
    // Re-measure while shown: cheap poll follows targets inside scroll containers
    // that don't emit window scroll events.
    this.zone.runOutsideAngular(() => {
      this.timer = window.setInterval(() => this.zone.run(() => this.measure()), 250);
    });
    window.addEventListener('resize', this.reflow, { passive: true });
    window.addEventListener('scroll', this.reflow, { passive: true, capture: true });
  }

  /**
   * The tour reuses this component instance across steps (the host `@if`
   * never goes false in between), so a new `targetSelector` doesn't get a
   * fresh `ngAfterViewInit`. Re-measure right away instead of waiting for
   * the next 250ms poll. The old rect is intentionally NOT cleared: if the
   * new target is already on screen the ring slides over to it (CSS
   * transition), and if it isn't rendered yet (page data still loading)
   * the bubble stays put until it appears — `measure()`'s grace window
   * decides when a persistent absence should actually hide it.
   */
  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['targetSelector'];
    if (change && !change.firstChange) {
      this.misses = 0;
      this.measure();
    }
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    window.removeEventListener('resize', this.reflow);
    window.removeEventListener('scroll', this.reflow, { capture: true } as EventListenerOptions);
  }

  private measure(): void {
    const vp = this.viewport();
    if (vp.w !== window.innerWidth || vp.h !== window.innerHeight) {
      this.viewport.set({ w: window.innerWidth, h: window.innerHeight });
    }

    const el = this.targetSelector ? document.querySelector(this.targetSelector) : null;
    const cur = this.rect();
    if (!el) {
      if (++this.misses > CoachmarkComponent.MISS_GRACE && cur) this.rect.set(null);
      return;
    }
    this.misses = 0;
    const next = el.getBoundingClientRect();
    // Avoid needless writes (keeps change detection quiet).
    if (!cur || cur.left !== next.left || cur.top !== next.top ||
        cur.width !== next.width || cur.height !== next.height) {
      this.rect.set(next);
    }
  }
}
