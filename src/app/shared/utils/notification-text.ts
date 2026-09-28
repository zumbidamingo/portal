import type { TranslateService } from '@ngx-translate/core';
import type { Notification, NotificationCategory, NotificationSeverity } from '../../core/models/notification.model';
import { formatLocalizedDate } from '../i18n/date-locale';

/** Parâmetros cujo valor é um código do backend (`NO_EMAIL`, `ADMIN_USERS`…): têm texto por locale. */
const CODE_KEYS = ['reason', 'dimension', 'status', 'actionType', 'source', 'occurrence'];
const MISSING = '—';

/**
 * Texto de uma notificação no locale ativo (issue #335): o título e o corpo saem das chaves
 * `notifications.types.<TIPO>.{title,body}` com os `params` do aviso, formatados para quem lê —
 * instantes (`...At`), datas (`...Date`), dinheiro (`...Amount` + `currency`) e códigos. Um tipo que
 * o portal não conhece cai no texto que o backend já renderizou na criação. Assim uma troca de idioma
 * reescreve tudo sem recriar nenhuma notificação.
 */
export function renderNotificationText(
  n: Pick<Notification, 'type' | 'params' | 'title' | 'body'>,
  translate: TranslateService,
  lang: string | null | undefined,
  timeZone?: string | null,
): { title: string; body: string } {
  const params = formatNotificationParams(n.params ?? {}, translate, lang, timeZone);
  return {
    title: fill(`notifications.types.${n.type}.title`, params, translate, n.title),
    body: fill(`notifications.types.${n.type}.body`, params, translate, n.body),
  };
}

export function formatNotificationParams(
  params: Record<string, string>,
  translate: TranslateService,
  lang: string | null | undefined,
  timeZone?: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    if (key.endsWith('At')) {
      out[key] = formatLocalizedDate(value, lang, 'datetime', timeZone);
    } else if (key.endsWith('Date')) {
      out[key] = formatLocalizedDate(value, lang, 'date');
    } else if (key.endsWith('Amount') && params['currency']) {
      out[key] = formatMoney(value, params['currency'], lang);
    } else if (CODE_KEYS.includes(key)) {
      const codeKey = `notifications.params.${key}.${value}`;
      const text = translate.instant(codeKey);
      out[key] = text === codeKey ? value : text;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function fill(key: string, params: Record<string, string>, translate: TranslateService, fallback: string | null): string {
  const template = translate.instant(key);
  if (!template || template === key) {
    return fallback ?? '';
  }
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match: string, name: string) => params[name] ?? MISSING);
}

function formatMoney(value: string, currency: string, lang: string | null | undefined): string {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return value;
  }
  try {
    return new Intl.NumberFormat(lang || undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return value;
  }
}

/** Ícone por categoria (a severidade dá a cor, não o ícone). */
export function categoryIcon(category: NotificationCategory | null): string {
  switch (category) {
    case 'SALES': return 'pi pi-chart-line';
    case 'OPERATIONS': return 'pi pi-wrench';
    case 'FINANCE': return 'pi pi-wallet';
    case 'SYSTEM': return 'pi pi-cog';
    default: return 'pi pi-bell';
  }
}

/** Cor por severidade, com os tokens do design system (nada de cor fixa). */
export function severityClasses(severity: NotificationSeverity | null): string {
  switch (severity) {
    case 'CRITICAL': return 'bg-app-danger-bg text-app-danger-text';
    case 'HIGH': return 'bg-app-warning-bg text-app-warning-text';
    case 'LOW': return 'bg-app-neutral-bg text-app-neutral-text';
    default: return 'bg-app-accent-soft text-app-accent';
  }
}

/** Dia de calendário de um instante — chave de agrupamento "Hoje"/"Ontem". */
export function dayBucket(iso: string, now: Date = new Date()): 'today' | 'yesterday' | string {
  const date = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
