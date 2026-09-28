import type { OrderStatus } from '../../core/services/order.service';

/**
 * Matiz de cada estado de Order (CLAUDE.md §10) — sistema de cores próprio porque p-tag/severity
 * só distingue 6 tons (poucos para 11 estados). Cada valor aponta para um par
 * `--status-<hue>-bg`/`--status-<hue>-fg` definido em styles.css, consumido por
 * {@link OrderStatusBadgeComponent}. Progressão pensada para ler a fase de longe: cinza
 * (ainda não começou) → frios (preparação/despacho) → violeta (execução ativa) → âmbar
 * (parcial, exige atenção) → verdes crescentes (conclusão) → laranja/vermelho reservados às
 * duas saídas fora do fluxo feliz (suspensa/cancelada), mesmo papel semântico de warn/danger.
 */
export const ORDER_STATUS_HUE: Record<OrderStatus, string> = {
  CREATED: 'gray',
  SCHEDULED: 'blue',
  ASSIGNED: 'indigo',
  CHECKED_IN: 'cyan',
  IN_PROGRESS: 'violet',
  AWAITING_RETURN: 'yellow',
  PARTIALLY_DONE: 'amber',
  COMPLETED: 'teal',
  SIGNED: 'green',
  FINISHED: 'mint',
  ON_HOLD: 'orange',
  CANCELLED: 'red',
};
