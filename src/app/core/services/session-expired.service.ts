import { Injectable, inject } from '@angular/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../auth/auth.service';

export const SESSION_EXPIRED_DIALOG_KEY = 'session-expired';

@Injectable({ providedIn: 'root' })
export class SessionExpiredService {
  private confirmService = inject(ConfirmationService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);
  private auth = inject(AuthService);

  private active = false;

  isActive(): boolean {
    return this.active;
  }

  show(): void {
    if (this.active) return;
    this.active = true;
    this.messageService.clear();

    this.confirmService.confirm({
      key: SESSION_EXPIRED_DIALOG_KEY,
      message: this.translate.instant('session.expiredMessage'),
      header: this.translate.instant('session.expiredTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('session.loginAgain'),
      rejectVisible: false,
      accept: () => {
        this.active = false;
        this.auth.logout();
      },
    });
  }
}
