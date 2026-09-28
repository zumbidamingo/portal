import { RouteDto, RouteStatus, RouteStop, RouteStopType } from '../../core/services/route.service';
import { ExecutionMode } from '../../core/services/order.service';

/** Uma linha da visão "Todos os técnicos" (issue de UX Rotas): técnico com rota planejada no dia
 *  OU com pedidos agendados e rota ainda por gerar — nunca some da lista por falta de rota. */
export interface TechnicianRow {
  technicianId: string;
  name: string;
  route: RouteDto | null;
  orderCount: number;
  /** `route.stops.length` quando há rota; senão `orderCount` (estimativa até a rota existir). */
  stopCount: number;
  status: RouteStatus | 'NOT_PLANNED' | 'ERROR';
  /** Motivo de falha vindo da geração em lote (issue #175), quando aplicável. */
  errorCode: string | null;
}

export interface DaySummary {
  technicianCount: number;
  totalStops: number;
  totalOrders: number;
  /** `null` quando nenhuma rota do dia tem distância/duração calculada ainda. */
  totalDistanceKm: number | null;
  totalDurationMinutes: number | null;
  /** Deslocamento + execução somados de todas as rotas visíveis. */
  totalRouteMinutes: number | null;
}

/** Uma parada já cruzada com a `Order`/`Customer` que representa, quando aplicável — paradas
 *  estruturais (`DROPOFF_HQ`, `LAUNDRY_*`, `CUSTOM`) não têm order por trás e ficam com esses
 *  campos nulos, usando os próprios `description`/`address`. */
export interface EnrichedStop extends RouteStop {
  technicianId: string;
  technicianName: string;
  orderNumber: number | null;
  customerName: string | null;
  addressText: string | null;
  /** A ordem por trás já passou (ou está) em AWAITING_RETURN (issue coleta/devolução) — uma
   *  paragem ONSITE ligada a ela é a visita de devolução, não uma execução comum, mesmo a ordem
   *  continuando EXTERNAL do início ao fim (mesma regra de `Order#isReturnLeg` no backend).
   *  Sempre `false` para paradas sem order. */
  isReturnLeg: boolean;
}

/** Rótulo i18n da paragem: a visita de devolução reaproveita a paragem `ONSITE` comum (issue
 *  coleta/devolução, sem tipo de paragem próprio) — sem isto ela lia "Execução" no painel de
 *  rotas, igual a qualquer outra visita, escondendo que é a devolução de uma coleta. */
export function stopTypeLabelKey(stop: Pick<EnrichedStop, 'stopType' | 'isReturnLeg'>): string {
  if (stop.stopType === 'ONSITE' && stop.isReturnLeg) return 'routing.stopType.RETURN_LEG';
  return 'routing.stopType.' + stop.stopType;
}

const TECHNICIAN_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706',
  '#9333ea', '#0891b2', '#db2777', '#65a30d',
];

/** Cada `stopType` já carrega o modo de execução que representa (issue #174 + split de ordem por
 *  modo, §10) — `ONSITE` é serviço no local, o resto do fluxo de tapete é `EXTERNAL`. `CUSTOM` é
 *  parada avulsa, sem ordem por trás, e fica fora do filtro (`null`). */
const STOP_EXECUTION_MODE: Record<RouteStopType, ExecutionMode | null> = {
  ONSITE: 'ONSITE',
  PICKUP: 'EXTERNAL',
  DROPOFF_HQ: 'EXTERNAL',
  LAUNDRY_DROPOFF: 'EXTERNAL',
  LAUNDRY_PICKUP: 'EXTERNAL',
  DELIVERY: 'EXTERNAL',
  CUSTOM: null,
  RETURN: null,
};

export function stopExecutionMode(stopType: RouteStopType): ExecutionMode | null {
  return STOP_EXECUTION_MODE[stopType];
}

/** Fallback determinístico por técnico (issue de UX Rotas §6) — usado só quando a cor real do
 *  Prestador (issue "Cor do Prestador") ainda não pôde ser resolvida, ex.: perfil de campo vendo
 *  a própria rota sem acesso de leitura a `/providers`. */
export function technicianColor(technicianId: string): string {
  let hash = 0;
  for (let i = 0; i < technicianId.length; i++) {
    hash = (hash * 31 + technicianId.charCodeAt(i)) >>> 0;
  }
  return TECHNICIAN_COLORS[hash % TECHNICIAN_COLORS.length];
}

/** Cor do Prestador (issue "Cor do Prestador") quando resolvida em `overrides` (chave =
 *  {@code technicianId}, o `User.id` do técnico — ver `Route.technicianId`); cai no hash
 *  determinístico de {@link technicianColor} senão. */
export function resolveTechnicianColor(technicianId: string, overrides: Map<string, string> | undefined): string {
  return overrides?.get(technicianId) ?? technicianColor(technicianId);
}
