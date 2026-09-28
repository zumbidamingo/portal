export type NotificationCategory = 'SALES' | 'OPERATIONS' | 'FINANCE' | 'SYSTEM';
export type NotificationSeverity = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
export type NotificationStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';
export type NotificationTab = 'ACTION' | 'ACTIVITY';

/** Destino calculado pelo backend a partir do catálogo — o portal não mapeia tipo→rota. */
export interface NotificationLink {
  route: string;
  queryParams: Record<string, string>;
}

/**
 * Uma notificação do sino. `type` é o nome do tipo do catálogo do backend (texto livre para o
 * portal: o texto vem de `notifications.types.<type>`, o ícone da categoria, a cor da severidade e
 * o destino do `link`) — não há união de tipos nem mapa por tipo no frontend.
 */
export interface Notification {
  id: string;
  userId: string;
  type: string;
  category: NotificationCategory | null;
  severity: NotificationSeverity | null;
  requiresAction: boolean;
  status: NotificationStatus;
  /** Texto renderizado no locale do destinatário à data da criação — recurso quando o portal não
   *  tem a chave do tipo. O texto mostrado vem de `params` no locale ativo. */
  title: string | null;
  body: string | null;
  read: boolean;
  occurrenceCount: number;
  subjectType: string | null;
  subjectId: string | null;
  params: Record<string, string> | null;
  payload: Record<string, string> | null;
  link: NotificationLink | null;
  createdAt: string;
  lastOccurredAt: string | null;
}

/** Contadores do sino. `badge` = ações abertas + críticas não lidas (o número do sino). */
export interface NotificationCounters {
  actionOpen: number;
  unreadCritical: number;
  unreadTotal: number;
  badge: number;
  byCategory: Partial<Record<NotificationCategory, number>>;
}

export interface NotificationPage {
  content: Notification[];
  page: { totalElements: number; totalPages: number; number: number; size: number };
}

/** Preferência por categoria × canal (issue #333). `hasCritical`: há avisos críticos que chegam sempre. */
export interface NotificationCategoryPreference {
  category: NotificationCategory;
  push: boolean;
  bell: boolean;
  hasCritical: boolean;
}

export type NotificationChannel = 'PUSH' | 'BELL';
