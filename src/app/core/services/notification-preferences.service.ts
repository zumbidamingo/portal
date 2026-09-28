import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NotificationCategory, NotificationCategoryPreference, NotificationChannel } from '../models/notification.model';

/** Preferências de notificação do próprio utilizador, por categoria × canal (issues #107, #333). */
@Injectable({ providedIn: 'root' })
export class NotificationPreferencesService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/notifications/preferences`;

  /** Só as categorias que o perfil do utilizador pode receber. */
  getMine(): Observable<NotificationCategoryPreference[]> {
    return this.http.get<NotificationCategoryPreference[]>(this.API);
  }

  update(category: NotificationCategory, channel: NotificationChannel, enabled: boolean): Observable<void> {
    return this.http.put<void>(this.API, { category, channel, enabled });
  }
}
