import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild,
  effect, inject, input, output, signal, untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import * as maplibregl from 'maplibre-gl';
import { RouteDto, RouteStopStatus } from '../../core/services/route.service';
import { ThemeService } from '../../core/services/theme.service';
import { mediaUrl } from '../../shared/utils/media-url';
import { EnrichedStop, resolveTechnicianColor, stopTypeLabelKey } from './routing-models';

const STOP_COLORS: Record<RouteStopStatus, string> = {
  PENDING: '#9ca3af',
  EN_ROUTE: '#3b82f6',
  ARRIVED: '#f59e0b',
  COMPLETED: '#22c55e',
  SKIPPED: '#ef4444',
};

// Estilos vetoriais da CARTO (gratuitos, sem chave): mesmo esquema de tiles, só muda a paleta.
const MAP_STYLES = {
  light: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
} as const;

// Origem/destino: quase preto some no Dark Matter, então invertem para um cinza claro.
// Centro do Brasil (1º mercado) — vista inicial enquanto a sede do tenant ainda não chegou; depois
// o mapa voa até ela.
const BRAZIL_CENTER: [number, number] = [-51.9, -14.2];

const ENDPOINT_COLORS = { light: '#111827', dark: '#E5E7EB' } as const;

/**
 * Mapa MapLibre da rota (ponto 4 do briefing) — desenha a rota já calculada pelo backend, nunca
 * recalcula nada. Suporta uma rota (um técnico) ou várias em simultâneo (modo "Todos os
 * técnicos", ponto 6), cada uma na cor do seu técnico (`technicianColor`, §6 — legibilidade antes
 * de complexidade visual). Lista e mapa são a mesma rota vista de dois jeitos: `selectedStopId`
 * sincroniza os dois sentidos.
 */
@Component({
  selector: 'app-routing-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="relative w-full h-full">
      <div #mapContainer class="w-full h-full"></div>
      @if (!mapReady() || loading()) {
        <div class="absolute inset-0 flex items-center justify-center bg-app-surface/70">
          <i class="pi pi-spin pi-spinner text-2xl text-app-text-tertiary"></i>
        </div>
      }
    </div>
  `,
})
export class RoutingMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainerRef!: ElementRef<HTMLDivElement>;

  routes = input<RouteDto[]>([]);
  stops = input<EnrichedStop[]>([]);
  selectedStopId = input<string | null>(null);
  loading = input(false);
  /** Sede do tenant — centro do mapa quando não há rota/paradas, e pin fixo com a logo (ou ícone
   *  de prédio, na falta dela) para a empresa sempre se localizar, mesmo com rotas desenhadas. */
  companyLocation = input<{ latitude: number; longitude: number; name?: string; logoUrl?: string | null } | null>(null);
  /** Cor do Prestador por `technicianId` (issue "Cor do Prestador") — hex, chave = `User.id`. */
  colorByTechnicianId = input<Map<string, string>>(new Map());

  stopSelected = output<string>();

  private translate = inject(TranslateService);
  private theme = inject(ThemeService);
  private currentStyle: string = MAP_STYLES.light;
  private map: maplibregl.Map | null = null;
  private markersByStopId = new Map<string, maplibregl.Marker>();
  private structuralMarkers: maplibregl.Marker[] = [];
  private lineSourceIds: string[] = [];
  private companyMarker: maplibregl.Marker | null = null;

  mapReady = signal(false);

  constructor() {
    effect(() => {
      // Depende de routes()/stops()/colorByTechnicianId()/mapReady(): qualquer mudança de dados
      // reconstrói o desenho — a cor do Prestador (issue "Cor do Prestador") costuma chegar
      // depois da rota, num fetch à parte.
      const routes = this.routes();
      const stops = this.stops();
      this.colorByTechnicianId();
      this.companyLocation();
      if (this.mapReady()) {
        this.render(routes, stops);
      }
    });

    effect(() => {
      const stopId = this.selectedStopId();
      if (!stopId) return;
      const marker = this.markersByStopId.get(stopId);
      if (!marker || !this.map) return;
      marker.togglePopup();
      this.map.flyTo({ center: marker.getLngLat(), zoom: Math.max(this.map.getZoom(), 13) });
    });

    // Troca de tema: setStyle descarta as fontes/camadas das rotas, então redesenha no style.load.
    // Sem refazer o enquadramento — o utilizador pode ter feito zoom/pan.
    effect(() => {
      const url = MAP_STYLES[this.theme.resolved()];
      if (!this.map || !this.mapReady() || url === this.currentStyle) return;
      this.currentStyle = url;
      this.map.once('style.load', () => this.render(untracked(this.routes), untracked(this.stops), false));
      this.map.setStyle(url);
    });

    // Sede chega via chamada assíncrona separada (tenant) — pode ficar pronta depois do mapa. Só
    // recentra se ainda não há rota/parada desenhada (dia sem rota planeada), senão sobrescreveria
    // o fitBounds da rota já visível.
    effect(() => {
      const company = this.companyLocation();
      if (!company || !this.map || !this.mapReady()) return;
      if (this.routes().length || this.stops().length) return;
      this.map.flyTo({ center: [company.longitude, company.latitude], zoom: 13, padding: this.overlayPadding() });
    });

    // Pin da sede é permanente — independente de render(), que só cuida de rota/paradas do dia —
    // para a empresa continuar visível no mapa mesmo com rotas desenhadas por cima.
    effect(() => {
      const company = this.companyLocation();
      this.companyMarker?.remove();
      this.companyMarker = null;
      if (!company || !this.map) return;

      const el = document.createElement('div');
      el.style.cssText = 'width:34px;height:34px;border-radius:50%;background:var(--app-bg);' +
        // Tokens da plataforma (tinta do botão primário), não hex: acompanham o tema claro/escuro.
        'border:3px solid var(--app-action);box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;' +
        'align-items:center;justify-content:center;overflow:hidden;';
      const showFallbackIcon = () => {
        el.innerHTML = `<i class="pi pi-building" style="color:var(--app-action);"></i>`;
      };
      if (mediaUrl(company.logoUrl)) {
        const img = document.createElement('img');
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        // background-image falha em silêncio (URL quebrada/placeholder) e deixaria o pin vazio —
        // <img> com fallback no erro troca para o ícone quando a logo não carrega.
        img.addEventListener('error', showFallbackIcon, { once: true });
        img.src = mediaUrl(company.logoUrl);
        el.appendChild(img);
      } else {
        showFallbackIcon();
      }

      this.companyMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([company.longitude, company.latitude])
        .setPopup(new maplibregl.Popup().setText(company.name ?? this.translate.instant('routing.origin')))
        .addTo(this.map);
    });
  }

  ngAfterViewInit(): void {
    const company = this.companyLocation();
    this.currentStyle = MAP_STYLES[this.theme.resolved()];
    // O worker é resolvido relativo ao módulo do maplibre, que o bundler/dev server move de sítio;
    // o build copia-o para a raiz (angular.json), por isso apontamos lá explicitamente.
    maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
    this.map = new maplibregl.Map({
      container: this.mapContainerRef.nativeElement,
      style: this.currentStyle,
      center: company ? [company.longitude, company.latitude] : BRAZIL_CENTER,
      zoom: company ? 13 : 4,
    });
    this.map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    this.map.on('load', () => this.mapReady.set(true));
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private render(routes: RouteDto[], stops: EnrichedStop[], fit = true): void {
    if (!this.map) return;
    this.clear();
    const endpointColor = ENDPOINT_COLORS[untracked(this.theme.resolved)];

    const allCoordinates: [number, number][] = [];
    const stopsByTechnician = new Map<string, EnrichedStop[]>();
    for (const stop of stops) {
      const list = stopsByTechnician.get(stop.technicianId) ?? [];
      list.push(stop);
      stopsByTechnician.set(stop.technicianId, list);
    }

    for (const route of routes) {
      const color = resolveTechnicianColor(route.technicianId, this.colorByTechnicianId());
      const technicianStops = (stopsByTechnician.get(route.technicianId) ?? [])
        .slice().sort((a, b) => a.sequence - b.sequence);

      // Via real quando o backend resolveu via OSRM (RouteMapper#geometry); reta entre pontos
      // como já era antes disto existir, caso a rota tenha vindo sem geometria (dado antigo).
      const hasRealGeometry = !!route.geometry?.length;
      const lineCoordinates: [number, number][] = hasRealGeometry
        ? route.geometry.map(p => [p.longitude, p.latitude] as [number, number])
        : [[route.originLongitude, route.originLatitude]];
      allCoordinates.push(...lineCoordinates);

      const originMarker = new maplibregl.Marker({ color: endpointColor })
        .setLngLat([route.originLongitude, route.originLatitude])
        .setPopup(new maplibregl.Popup().setText(this.translate.instant('routing.origin')))
        .addTo(this.map);
      this.structuralMarkers.push(originMarker);
      allCoordinates.push([route.originLongitude, route.originLatitude]);

      for (const stop of technicianStops) {
        const lngLat: [number, number] = [stop.longitude, stop.latitude];
        if (!hasRealGeometry) lineCoordinates.push(lngLat);
        allCoordinates.push(lngLat);

        const el = document.createElement('div');
        el.className = 'routing-map-marker';
        el.style.cssText = `width:26px;height:26px;border-radius:50%;background:${STOP_COLORS[stop.status]};` +
          'border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);display:flex;align-items:center;' +
          'justify-content:center;color:#fff;font-size:11px;font-weight:600;cursor:pointer;';
        el.textContent = String(stop.sequence + 1);

        const label = this.translate.instant(stopTypeLabelKey(stop));
        const popupLines = [
          `#${stop.sequence + 1} — ${label}`,
          stop.orderNumber != null ? `OS #${stop.orderNumber}` : null,
          stop.customerName ?? stop.description ?? null,
          routes.length > 1 ? stop.technicianName : null,
        ].filter(Boolean).join('\n');

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(lngLat)
          .setPopup(new maplibregl.Popup().setText(popupLines))
          .addTo(this.map);
        el.addEventListener('click', () => this.stopSelected.emit(stop.id));
        this.markersByStopId.set(stop.id, marker);
      }

      if (route.destinationLatitude != null && route.destinationLongitude != null) {
        const destLngLat: [number, number] = [route.destinationLongitude, route.destinationLatitude];
        if (!hasRealGeometry) lineCoordinates.push(destLngLat);
        allCoordinates.push(destLngLat);
        const destinationMarker = new maplibregl.Marker({ color: endpointColor })
          .setLngLat(destLngLat)
          .setPopup(new maplibregl.Popup().setText(this.translate.instant('routing.destination')))
          .addTo(this.map);
        this.structuralMarkers.push(destinationMarker);
      }

      if (lineCoordinates.length > 1) {
        const sourceId = `route-line-${route.id}`;
        this.map.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: lineCoordinates } },
        });
        this.map.addLayer({
          id: sourceId,
          type: 'line',
          source: sourceId,
          // Sólida quando é via real (OSRM); pontilhada só na reta de fallback, pra não passar
          // a impressão de precisão que ela não tem.
          paint: hasRealGeometry
            ? { 'line-color': color, 'line-width': 3 }
            : { 'line-color': color, 'line-width': 3, 'line-dasharray': [2, 1] },
        });
        this.lineSourceIds.push(sourceId);
      }
    }

    if (fit && allCoordinates.length) {
      const company = this.companyLocation();
      let bounds: maplibregl.LngLatBounds;
      if (company) {
        // A sede é o ponto central: bounds simétricos em torno dela, com a folga que alcança o
        // ponto mais distante da rota — o fitBounds centra o retângulo, logo centra a sede.
        const dLng = Math.max(...allCoordinates.map(c => Math.abs(c[0] - company.longitude)), 0.005);
        const dLat = Math.max(...allCoordinates.map(c => Math.abs(c[1] - company.latitude)), 0.005);
        bounds = new maplibregl.LngLatBounds(
          [company.longitude - dLng, company.latitude - dLat],
          [company.longitude + dLng, company.latitude + dLat],
        );
      } else {
        bounds = allCoordinates.reduce(
          (b, c) => b.extend(c),
          new maplibregl.LngLatBounds(allCoordinates[0], allCoordinates[0]),
        );
      }
      this.map.fitBounds(bounds, { padding: this.overlayPadding(), maxZoom: 14 });
    }
  }

  /** Folga para os painéis flutuantes da tela (cabeçalho em cima, lista à esquerda no desktop):
   *  o centro da área visível do mapa — onde a sede cai — fica livre de overlay. */
  private overlayPadding(): maplibregl.PaddingOptions {
    const desktop = window.matchMedia('(min-width: 1024px)').matches;
    return { top: 170, bottom: 60, left: desktop ? 360 : 60, right: 60 };
  }

  private clear(): void {
    if (!this.map) return;
    this.markersByStopId.forEach(m => m.remove());
    this.markersByStopId.clear();
    this.structuralMarkers.forEach(m => m.remove());
    this.structuralMarkers = [];
    for (const id of this.lineSourceIds) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
      if (this.map.getSource(id)) this.map.removeSource(id);
    }
    this.lineSourceIds = [];
  }
}
