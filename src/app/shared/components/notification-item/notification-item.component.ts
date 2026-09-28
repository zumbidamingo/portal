import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { merge } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Notification } from '../../../core/models/notification.model';
import { TenantService } from '../../../core/services/tenant.service';
import { LocalizedDatePipe } from '../../pipes/localized-date.pipe';
import { categoryIcon, renderNotificationText, severityClasses } from '../../utils/notification-text';

/**
 * Uma linha do sino: ícone pela categoria, cor pela severidade, texto com o contexto do aviso
 * (número da ordem, cliente…) no locale ativo, quando aconteceu, quantas ocorrências e — nas
 * acionáveis — "Dispensar". Partilhada pela central de notificações e pelo dropdown do sino.
 */
@Component({
  selector: 'app-notification-item',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, LocalizedDatePipe],
  template: `
    <div class="relative flex items-start gap-3 border-b border-app-border transition-colors"
         [class]="containerClass()">
      @if (!notification().read && notification().status === 'OPEN') {
        <span class="absolute left-0 top-0 bottom-0 w-0.5 bg-app-accent" aria-hidden="true"></span>
      }
      <button type="button"
              class="flex min-w-0 flex-1 items-start gap-3 text-left cursor-pointer bg-transparent border-0 p-0"
              [class]="compact() ? 'py-2.5 pl-4' : 'py-4 pl-5'"
              (click)="opened.emit(notification())">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" [class]="iconClasses()" aria-hidden="true">
          <i [class]="icon()"></i>
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm text-app-text" [class.font-semibold]="!notification().read" [class.font-medium]="notification().read">
            {{ text().title }}
          </span>
          <span class="mt-0.5 block text-sm text-app-text-secondary">{{ text().body }}</span>
          <span class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-app-text-tertiary">
            <span>{{ (notification().lastOccurredAt ?? notification().createdAt) | localizedDate:'datetime':timeZone() }}</span>
            @if (notification().occurrenceCount > 1) {
              <span class="rounded-full bg-app-neutral-bg px-1.5 py-0.5 text-app-neutral-text">
                {{ 'notifications.occurrences' | translate: { count: notification().occurrenceCount } }}
              </span>
            }
            @if (notification().status === 'RESOLVED') {
              <span class="rounded-full bg-app-success-bg px-1.5 py-0.5 text-app-success-text">{{ 'notifications.resolved' | translate }}</span>
            }
            @if (notification().severity === 'CRITICAL') {
              <span class="rounded-full bg-app-danger-bg px-1.5 py-0.5 text-app-danger-text">{{ 'notifications.severities.CRITICAL' | translate }}</span>
            }
          </span>
        </span>
      </button>
      @if (canDismiss()) {
        <button type="button"
                class="mr-3 mt-3 shrink-0 rounded-md px-2 py-1 text-xs text-app-text-secondary hover:bg-app-surface-hover cursor-pointer bg-transparent border-0"
                [attr.aria-label]="'notifications.dismiss' | translate"
                (click)="dismissed.emit(notification())">
          {{ 'notifications.dismiss' | translate }}
        </button>
      }
    </div>
  `,
})
export class NotificationItemComponent {
  private translate = inject(TranslateService);
  private tenantService = inject(TenantService);

  readonly notification = input.required<Notification>();
  readonly compact = input(false);
  readonly opened = output<Notification>();
  readonly dismissed = output<Notification>();

  protected timeZone = computed(() => this.tenantService.current()?.timezone ?? null);
  protected icon = computed(() => categoryIcon(this.notification().category));
  protected iconClasses = computed(() => severityClasses(this.notification().severity));
  protected canDismiss = computed(() => this.notification().requiresAction && this.notification().status === 'OPEN');
  protected containerClass = computed(() => {
    const n = this.notification();
    const unread = !n.read && n.status === 'OPEN';
    const dim = n.status !== 'OPEN' ? ' opacity-60' : '';
    return (unread ? 'bg-app-accent-soft' : 'bg-app-bg hover:bg-app-surface-hover') + dim;
  });

  /** Muda quando o idioma troca ou as traduções acabam de carregar — o texto é reavaliado nesse momento. */
  private translationsVersion = toSignal(
    merge(this.translate.onLangChange, this.translate.onTranslationChange).pipe(map(() => Date.now()), startWith(0)),
    { initialValue: 0 },
  );

  protected text = computed(() => {
    this.translationsVersion();
    return renderNotificationText(this.notification(), this.translate, this.translate.getCurrentLang(), this.timeZone());
  });
}
