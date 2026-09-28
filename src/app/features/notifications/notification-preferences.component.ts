import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { NotificationCategory, NotificationCategoryPreference, NotificationChannel } from '../../core/models/notification.model';
import { NotificationPreferencesService } from '../../core/services/notification-preferences.service';
import { TenantService } from '../../core/services/tenant.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

/**
 * Preferências de notificação do próprio utilizador (issue #334): uma matriz categoria × canal —
 * Push (telemóvel) e Sino (dentro do portal). Cada perfil só vê as categorias que pode receber
 * (o backend decide); a que tem avisos críticos avisa que esses chegam sempre. Cada alteração é
 * gravada na hora e, se falhar, o interruptor volta ao que estava — nada finge ter funcionado.
 * O horário de silêncio é da empresa e aparece só como informação; a edição fica em Parâmetros do Sistema.
 */
@Component({
  selector: 'app-notification-preferences',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, ButtonModule, ToggleSwitchModule, PageHeaderComponent],
  template: `
    <div class="max-w-2xl space-y-5">
      <app-page-header [title]="'notificationPreferences.title' | translate" [description]="'notificationPreferences.subtitle' | translate">
        <a routerLink="/notifications" class="text-sm text-app-accent hover:underline">{{ 'notificationPreferences.back' | translate }}</a>
      </app-page-header>

      @if (loadFailed()) {
        <div class="rounded-md border border-app-border p-6 text-center">
          <p class="text-sm text-app-text-secondary">{{ 'notificationPreferences.loadError' | translate }}</p>
          <p-button class="mt-3" [label]="'notificationPreferences.retry' | translate" [outlined]="true" size="small" (onClick)="load()"></p-button>
        </div>
      } @else if (loaded() && !rows().length) {
        <p class="text-sm text-app-text-secondary">{{ 'notificationPreferences.empty' | translate }}</p>
      } @else if (loaded()) {
        <form [formGroup]="form" class="overflow-hidden rounded-md border border-app-border">
          <div class="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 border-b border-app-border bg-app-surface px-4 py-2 text-xs font-medium uppercase tracking-wide text-app-text-tertiary">
            <span>{{ 'notificationPreferences.category' | translate }}</span>
            <span class="text-center" [title]="'notificationPreferences.pushHelp' | translate">{{ 'notificationPreferences.push' | translate }}</span>
            <span class="text-center" [title]="'notificationPreferences.bellHelp' | translate">{{ 'notificationPreferences.bell' | translate }}</span>
          </div>
          @for (row of rows(); track row.category) {
            <div class="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 border-b border-app-border px-4 py-3 last:border-b-0">
              <div>
                <p class="text-sm font-medium text-app-text">{{ 'notifications.categories.' + row.category | translate }}</p>
                @if (row.hasCritical) {
                  <p class="mt-0.5 flex items-center gap-1 text-xs text-app-text-tertiary">
                    <i class="pi pi-lock" aria-hidden="true"></i>{{ 'notificationPreferences.criticalLocked' | translate }}
                  </p>
                }
              </div>
              <div class="flex justify-center">
                <p-toggleswitch [formControlName]="row.category + '_PUSH'"
                                [attr.aria-label]="('notifications.categories.' + row.category | translate) + ' — ' + ('notificationPreferences.push' | translate)"></p-toggleswitch>
              </div>
              <div class="flex justify-center">
                <p-toggleswitch [formControlName]="row.category + '_BELL'"
                                [attr.aria-label]="('notifications.categories.' + row.category | translate) + ' — ' + ('notificationPreferences.bell' | translate)"></p-toggleswitch>
              </div>
            </div>
          }
        </form>

        <div class="rounded-md bg-app-surface p-4 text-sm text-app-text-secondary">
          <p>{{ quietHoursText() }}</p>
          <p class="mt-1 text-xs text-app-text-tertiary">{{ 'notificationPreferences.quietHoursEdit' | translate }}</p>
        </div>
      }
    </div>
  `,
})
export class NotificationPreferencesComponent implements OnInit {
  private preferencesService = inject(NotificationPreferencesService);
  private tenantService = inject(TenantService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);
  private destroyRef = inject(DestroyRef);

  readonly rows = signal<NotificationCategoryPreference[]>([]);
  readonly loaded = signal(false);
  readonly loadFailed = signal(false);
  form = new FormGroup<Record<string, FormControl<boolean>>>({});

  /** Frase do horário de silêncio vigente da empresa — só informação. */
  readonly quietHoursText = computed(() => {
    const params = this.tenantService.current()?.systemParameters;
    if (params?.notificationQuietHoursEnabled) {
      return this.translate.instant('notificationPreferences.quietHoursOn', {
        start: params.notificationQuietStart, end: params.notificationQuietEnd,
      });
    }
    return this.translate.instant('notificationPreferences.quietHoursOff');
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loadFailed.set(false);
    this.preferencesService.getMine().subscribe({
      next: rows => {
        this.rows.set(rows);
        this.form = this.buildForm(rows);
        this.loaded.set(true);
      },
      error: () => {
        this.loadFailed.set(true);
        this.loaded.set(true);
      },
    });
  }

  private buildForm(rows: NotificationCategoryPreference[]): FormGroup<Record<string, FormControl<boolean>>> {
    const controls: Record<string, FormControl<boolean>> = {};
    for (const row of rows) {
      controls[`${row.category}_PUSH`] = new FormControl(row.push, { nonNullable: true });
      controls[`${row.category}_BELL`] = new FormControl(row.bell, { nonNullable: true });
    }
    const form = new FormGroup(controls);
    for (const row of rows) {
      this.watch(form, row.category, 'PUSH');
      this.watch(form, row.category, 'BELL');
    }
    return form;
  }

  private watch(form: FormGroup<Record<string, FormControl<boolean>>>, category: NotificationCategory, channel: NotificationChannel): void {
    const control = form.controls[`${category}_${channel}`];
    control.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(enabled => {
      this.preferencesService.update(category, channel, enabled).subscribe({
        next: () => this.messageService.add({ severity: 'success', summary: this.translate.instant('notificationPreferences.saved') }),
        error: () => {
          // Não deixa o interruptor a mentir: volta ao valor anterior sem disparar nova gravação.
          control.setValue(!enabled, { emitEvent: false });
          this.messageService.add({ severity: 'error', summary: this.translate.instant('notificationPreferences.saveError') });
        },
      });
    });
  }
}
