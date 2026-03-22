"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./routeplanning.module.css";

type CourierOption = {
  id: string;
  full_name: string;
};

type DropColor = "red" | "yellow" | "purple" | "gray" | "black" | "green";

type PickingUnit = {
  id: string;
  barcode: string;
  status: string;
  cell_id: string | null;
  created_at: string;
  scenario: string | null;
  cell: {
    id: string;
    code: string;
    meta?: {
      description?: string;
    } | null;
  } | null;
};

type DroppedUnit = {
  unit_id: string;
  unit_barcode: string;
  current_status: string;
  current_cell_id: string | null;
  dropped_at: string;
  courier_user_id: string;
  courier_name: string;
  note: string | null;
  ops_status: string | null;
  color_key: DropColor;
  color_hex: string;
  lat: number | null;
  lng: number | null;
};

type DropPoint = {
  id: string;
  task_id: string;
  unit_id: string;
  unit_barcode: string;
  courier_user_id: string;
  courier_name: string;
  happened_at: string;
  note: string | null;
  ops_status: string | null;
  color_key: DropColor;
  color_hex: string;
  lat: number | null;
  lng: number | null;
};

type LiveCourier = {
  shift_id: string;
  courier_user_id: string;
  courier_name: string;
  status: string;
  started_at: string;
  active_tasks: number;
  last_location: {
    lat: number | null;
    lng: number | null;
    recorded_at: string;
    accuracy_m: number | null;
  } | null;
};

type ZoneStyle = {
  strokeColor: string;
  fillColor: string;
  fillOpacity: number;
  strokeOpacity: number;
  strokeWeight: number;
};

type Zone = {
  id: string;
  name: string;
  code: string;
  priority: number;
  polygon: unknown[];
  style: ZoneStyle;
};

type DashboardResponse = {
  ok: true;
  role: string;
  can_edit: boolean;
  updated_at: string;
  couriers: CourierOption[];
  picking_units: PickingUnit[];
  dropped_units: DroppedUnit[];
  drop_points: DropPoint[];
  live_couriers: LiveCourier[];
  zones: Zone[];
};

type AssignResponse = {
  ok: boolean;
  partial?: boolean;
  success_count?: number;
  failed_count?: number;
  successful_unit_ids?: string[];
  failed?: Array<{
    unit_id: string;
    status: number;
    error: string | null;
  }>;
  error?: string;
};

type RoutePlanningClientProps = {
  initialRole: string;
  initialCanEdit: boolean;
  mapsApiKey: string;
};

type MapPanelProps = {
  apiKey: string;
  zones: Zone[];
  dropPoints: DropPoint[];
  liveCouriers: LiveCourier[];
  showCouriers: boolean;
  colorFilter: Set<DropColor>;
  onColorFilterChange: (color: DropColor) => void;
  onShowCouriersChange: (show: boolean) => void;
  availableColors: DropColor[];
};

type ZoneEditorModalProps = {
  open: boolean;
  apiKey: string;
  canEdit: boolean;
  seedZones: Zone[];
  onClose: () => void;
  onUnauthorized: () => void;
  onZonesUpdated: (zones: Zone[]) => void;
};

type CourierInsightsModalProps = {
  open: boolean;
  onClose: () => void;
  onUnauthorized: () => void;
  apiKey: string;
};

type CourierCardSummary = {
  courier_user_id: string;
  courier_name: string;
  role: string;
  open_shift: {
    id: string;
    status: string;
    started_at: string;
  } | null;
  active_tasks: number;
  last_location: {
    lat: number | null;
    lng: number | null;
    recorded_at: string;
    accuracy_m: number | null;
  } | null;
  stats: {
    total: number;
    dropped: number;
    failed: number;
    returned: number;
    lastEventAt: string | null;
  };
};

type CourierInsightsListResponse = {
  ok: boolean;
  from: string;
  to: string;
  couriers: CourierCardSummary[];
  error?: string;
};

type CourierInsightsDetailResponse = {
  ok: boolean;
  from: string;
  to: string;
  courier: {
    courier_user_id: string;
    courier_name: string;
    role: string;
  };
  summary: {
    shifts_count: number;
    tasks_count: number;
    events_count: number;
    location_points_count: number;
    handovers_count: number;
    distance_km: number;
    shift_status_breakdown: Record<string, number>;
    task_status_breakdown: Record<string, number>;
    event_breakdown: Record<string, number>;
  };
  shifts: Array<{
    id: string;
    status: string;
    started_at: string;
    closed_at: string | null;
    start_note: string | null;
    close_note: string | null;
  }>;
  tasks: Array<{
    id: string;
    status: string;
    claimed_at: string | null;
    accepted_at: string | null;
    delivered_at: string | null;
    failed_at: string | null;
    returned_at: string | null;
    fail_reason: string | null;
    fail_comment: string | null;
    last_event_at: string | null;
    unit: {
      id: string;
      barcode: string | null;
      status: string | null;
    };
  }>;
  events: Array<{
    id: string;
    event_type: string;
    happened_at: string;
    note: string | null;
    ops_status: string | null;
    color_key: DropColor | null;
    color_hex: string | null;
    lat: number | null;
    lng: number | null;
    unit: {
      id: string;
      barcode: string | null;
      status: string | null;
    };
  }>;
  locations: Array<{
    id: string;
    shift_id: string | null;
    zone_id: string | null;
    lat: number | null;
    lng: number | null;
    recorded_at: string;
    accuracy_m: number | null;
    speed_m_s: number | null;
    heading_deg: number | null;
    battery_level: number | null;
  }>;
  handovers: Array<{
    id: string;
    shift_id: string | null;
    status: string;
    started_at: string;
    confirmed_at: string | null;
    note: string | null;
  }>;
  error?: string;
};

declare global {
  interface Window {
    google?: {
      maps: any;
    };
    __routePlanningMapInit?: () => void;
  }
}

const MAP_SCRIPT_ID = "routeplanning-google-maps-script";
const TARGET_WAREHOUSE_ZONE_CODE = "geri-qaytarmalar-anbar";
const DROP_CLUSTER_ZOOM_THRESHOLD = 13;
const DROP_COLOR_ORDER: DropColor[] = [
  "red",
  "yellow",
  "purple",
  "gray",
  "black",
  "green",
];
const DROP_COLOR_LABEL: Record<DropColor, string> = {
  red: "Красный",
  yellow: "Желтый",
  purple: "Фиолетовый",
  gray: "Серый",
  black: "Черный",
  green: "Зеленый",
};
const DROP_COLOR_HEX: Record<DropColor, string> = {
  red: "#ef4444",
  yellow: "#eab308",
  purple: "#a855f7",
  gray: "#6b7280",
  black: "#111827",
  green: "#22c55e",
};
let googleMapsPromise: Promise<any> | null = null;
const DEFAULT_ZONE_STYLE: ZoneStyle = {
  strokeColor: "#2563eb",
  fillColor: "#60a5fa",
  fillOpacity: 0.14,
  strokeOpacity: 0.75,
  strokeWeight: 2,
};

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePolygon(rawPolygon: unknown): Array<{ lat: number; lng: number }> {
  if (!Array.isArray(rawPolygon)) return [];
  return rawPolygon
    .map((point) => {
      if (!point || typeof point !== "object") return null;
      const record = point as Record<string, unknown>;
      const lat = toFiniteNumber(record.lat);
      const lng = toFiniteNumber(record.lng);
      if (lat === null || lng === null) return null;
      return { lat, lng };
    })
    .filter((point): point is { lat: number; lng: number } => point !== null);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateTimeLocalValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    admin: "admin",
    logistics: "logistics",
    head: "head",
    manager: "manager",
    worker: "worker",
    ops: "ops",
    hub_worker: "hub_worker",
    compliance: "compliance",
  };
  return map[role] || role || "unknown";
}

function normalizeZoneStyle(input: Partial<ZoneStyle> | null | undefined): ZoneStyle {
  return {
    strokeColor: input?.strokeColor || DEFAULT_ZONE_STYLE.strokeColor,
    fillColor: input?.fillColor || DEFAULT_ZONE_STYLE.fillColor,
    fillOpacity:
      typeof input?.fillOpacity === "number"
        ? Math.max(0.05, Math.min(0.9, input.fillOpacity))
        : DEFAULT_ZONE_STYLE.fillOpacity,
    strokeOpacity:
      typeof input?.strokeOpacity === "number"
        ? Math.max(0.1, Math.min(1, input.strokeOpacity))
        : DEFAULT_ZONE_STYLE.strokeOpacity,
    strokeWeight:
      typeof input?.strokeWeight === "number"
        ? Math.max(1, Math.min(8, input.strokeWeight))
        : DEFAULT_ZONE_STYLE.strokeWeight,
  };
}

function codeFromName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || `zone-${Date.now().toString(36)}`
  );
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function mercatorProject(lat: number, lng: number): { x: number; y: number } {
  const sin = Math.sin((lat * Math.PI) / 180);
  const clamped = Math.min(Math.max(sin, -0.9999), 0.9999);
  return {
    x: (lng + 180) / 360,
    y: 0.5 - Math.log((1 + clamped) / (1 - clamped)) / (4 * Math.PI),
  };
}

function clusterCellSizePx(zoom: number): number {
  if (zoom <= 7) return 88;
  if (zoom <= 9) return 72;
  if (zoom <= 11) return 56;
  return 44;
}

type DropRenderPoint = {
  lat: number;
  lng: number;
  color_key: DropColor;
  color_hex: string;
  count: number;
  sample: DropPoint;
  clustered: boolean;
};

function buildDropRenderPoints(dropPoints: DropPoint[], zoom: number): DropRenderPoint[] {
  if (zoom >= DROP_CLUSTER_ZOOM_THRESHOLD) {
    return dropPoints
      .filter((drop) => drop.lat !== null && drop.lng !== null)
      .map((drop) => ({
        lat: drop.lat as number,
        lng: drop.lng as number,
        color_key: drop.color_key,
        color_hex: drop.color_hex || DROP_COLOR_HEX[drop.color_key],
        count: 1,
        sample: drop,
        clustered: false,
      }));
  }

  const cellSize = clusterCellSizePx(zoom);
  const worldPx = 256 * Math.pow(2, zoom);
  const buckets = new Map<
    string,
    {
      latSum: number;
      lngSum: number;
      count: number;
      sample: DropPoint;
      color_key: DropColor;
      color_hex: string;
    }
  >();

  for (const drop of dropPoints) {
    if (drop.lat === null || drop.lng === null) continue;
    const projected = mercatorProject(drop.lat, drop.lng);
    const px = projected.x * worldPx;
    const py = projected.y * worldPx;
    const cellX = Math.floor(px / cellSize);
    const cellY = Math.floor(py / cellSize);
    const key = `${drop.color_key}:${cellX}:${cellY}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.latSum += drop.lat;
      existing.lngSum += drop.lng;
      existing.count += 1;
    } else {
      buckets.set(key, {
        latSum: drop.lat,
        lngSum: drop.lng,
        count: 1,
        sample: drop,
        color_key: drop.color_key,
        color_hex: drop.color_hex || DROP_COLOR_HEX[drop.color_key],
      });
    }
  }

  return Array.from(buckets.values()).map((bucket) => ({
    lat: bucket.latSum / bucket.count,
    lng: bucket.lngSum / bucket.count,
    color_key: bucket.color_key,
    color_hex: bucket.color_hex,
    count: bucket.count,
    sample: bucket.sample,
    clustered: bucket.count > 1,
  }));
}

function buildCourierAvatarSvg(seed: string): string {
  const palette = ["#22c55e", "#3b82f6", "#f59e0b", "#f97316", "#a855f7", "#ef4444", "#06b6d4"];
  const color = palette[hashString(seed) % palette.length];
  const faceVariant = hashString(`${seed}-face`) % 3;
  const smilePath =
    faceVariant === 0
      ? "M 13 20 C 15 23 21 23 23 20"
      : faceVariant === 1
        ? "M 13 19 C 15 22 21 22 23 19"
        : "M 13 21 C 15 24 21 24 23 21";
  const wink = faceVariant === 2 ? "<line x1='21' y1='15' x2='24' y2='15' stroke='#0f172a' stroke-width='2' stroke-linecap='round'/>" : "<circle cx='22.5' cy='15' r='1.8' fill='#0f172a'/>";
  return `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'>
  <circle cx='18' cy='18' r='16' fill='${color}' stroke='white' stroke-width='2'/>
  <circle cx='13.5' cy='15' r='1.8' fill='#0f172a'/>
  ${wink}
  <path d='${smilePath}' fill='none' stroke='#0f172a' stroke-width='2' stroke-linecap='round'/>
</svg>`;
}

function buildCourierIcon(
  maps: any,
  seed: string,
): { url: string; scaledSize: any; anchor: any } {
  const svg = buildCourierAvatarSvg(seed);
  const dataUri = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  return {
    url: dataUri,
    scaledSize: new maps.Size(36, 36),
    anchor: new maps.Point(18, 18),
  };
}

function buildWarehouseZoneIcon(maps: any): { url: string; scaledSize: any; anchor: any } {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'>
  <circle cx='17' cy='17' r='15' fill='#ef4444' stroke='white' stroke-width='2'/>
  <path d='M9 16 L17 11 L25 16 V24 H9 Z' fill='white' opacity='0.95'/>
  <rect x='15' y='18' width='4' height='6' fill='#ef4444'/>
  </svg>`;
  const dataUri = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  return {
    url: dataUri,
    scaledSize: new maps.Size(34, 34),
    anchor: new maps.Point(17, 17),
  };
}

function loadGoogleMaps(apiKey: string): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps доступен только в браузере"));
  }

  if (!apiKey.trim()) {
    return Promise.reject(
      new Error("NEXT_PUBLIC_GOOGLE_MAPS_JS_API_KEY не задан, карта недоступна"),
    );
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise<any>((resolve, reject) => {
    const existingScript = document.getElementById(MAP_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      const onLoad = () => {
        if (window.google?.maps) {
          resolve(window.google.maps);
        } else {
          reject(new Error("Google Maps script загружен, но API не инициализирован"));
        }
      };
      existingScript.addEventListener("load", onLoad, { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Не удалось загрузить Google Maps script")),
        { once: true },
      );
      return;
    }

    const callbackName = "__routePlanningMapInit";
    window.__routePlanningMapInit = () => {
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        reject(new Error("Google Maps callback сработал, но maps API пуст"));
      }
    };

    const script = document.createElement("script");
    script.id = MAP_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${callbackName}&v=weekly`;
    script.onerror = () => {
      reject(new Error("Ошибка загрузки Google Maps JavaScript API"));
    };
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

function RoutePlanningMap({
  apiKey,
  zones,
  dropPoints,
  liveCouriers,
  showCouriers,
  colorFilter,
  onColorFilterChange,
  onShowCouriersChange,
  availableColors,
}: MapPanelProps) {
  const mapCanvasRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapObjectsRef = useRef<{ markers: any[]; polygons: any[] }>({
    markers: [],
    polygons: [],
  });
  const hasAutoFittedRef = useRef(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [mapZoom, setMapZoom] = useState<number>(11);

  const clearMapObjects = useCallback(() => {
    for (const marker of mapObjectsRef.current.markers) {
      marker.setMap(null);
    }
    for (const polygon of mapObjectsRef.current.polygons) {
      polygon.setMap(null);
    }
    mapObjectsRef.current = { markers: [], polygons: [] };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMapError(null);

    void loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled) return;
        if (!mapCanvasRef.current) return;
        if (!mapRef.current) {
          mapRef.current = new maps.Map(mapCanvasRef.current, {
            center: { lat: 40.4093, lng: 49.8671 },
            zoom: 11,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            clickableIcons: false,
          });
        }
        setMapZoom(mapRef.current.getZoom() || 11);
        setMapsReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Не удалось инициализировать карту";
        setMapError(message);
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    return () => clearMapObjects();
  }, [clearMapObjects]);

  useEffect(() => {
    if (!mapsReady || !mapRef.current) return;
    const map = mapRef.current;
    const listener = map.addListener("zoom_changed", () => {
      const nextZoom = map.getZoom();
      if (typeof nextZoom === "number") {
        setMapZoom(nextZoom);
      }
    });
    return () => {
      listener?.remove?.();
    };
  }, [mapsReady]);

  useEffect(() => {
    if (!mapsReady || !mapRef.current || !window.google?.maps) return;

    const maps = window.google.maps;
    const map = mapRef.current;
    clearMapObjects();

    const bounds = new maps.LatLngBounds();
    let hasBounds = false;
    const infoWindow = new maps.InfoWindow();
    let renderedZonePolygons = 0;
    let targetZoneRendered = false;

    for (const zone of zones) {
      const path = parsePolygon(zone.polygon);
      if (path.length < 3) continue;
      const style = normalizeZoneStyle(zone.style);
      const isTargetWarehouseZone =
        (zone.code || "").trim().toLowerCase() === TARGET_WAREHOUSE_ZONE_CODE;
      if (isTargetWarehouseZone) targetZoneRendered = true;

      const polygon = new maps.Polygon({
        paths: path,
        strokeColor: style.strokeColor,
        strokeOpacity: style.strokeOpacity,
        strokeWeight: style.strokeWeight,
        fillColor: style.fillColor,
        fillOpacity: style.fillOpacity,
      });
      polygon.setMap(map);
      mapObjectsRef.current.polygons.push(polygon);
      renderedZonePolygons += 1;

      for (const point of path) {
        bounds.extend(point);
        hasBounds = true;
      }

      if (isTargetWarehouseZone) {
        const centroid = path.reduce(
          (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
          { lat: 0, lng: 0 },
        );
        const position = {
          lat: centroid.lat / path.length,
          lng: centroid.lng / path.length,
        };
        const marker = new maps.Marker({
          map,
          position,
          title: `${zone.name || "Склад"} (${zone.code})`,
          icon: buildWarehouseZoneIcon(maps),
          zIndex: 2000,
        });
        mapObjectsRef.current.markers.push(marker);
        bounds.extend(marker.getPosition());
      }
    }

    const effectiveZoom = typeof mapZoom === "number" ? mapZoom : map.getZoom() || 11;
    const renderedDropPoints = buildDropRenderPoints(dropPoints, effectiveZoom);
    for (const drop of renderedDropPoints) {
      const marker = new maps.Marker({
        map,
        position: { lat: drop.lat, lng: drop.lng },
        title:
          drop.count > 1
            ? `${DROP_COLOR_LABEL[drop.color_key]}: ${drop.count} дропов`
            : `Дроп ${drop.sample.unit_barcode || drop.sample.unit_id}`,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: drop.count > 1 ? Math.min(17, 9 + Math.log2(drop.count) * 2.4) : 5,
          fillColor: drop.color_hex || "#ef4444",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: drop.count > 1 ? 2 : 1,
        },
        label:
          drop.count > 1
            ? {
                text: String(drop.count),
                color: "#ffffff",
                fontWeight: "700",
                fontSize: "12px",
              }
            : undefined,
        zIndex: drop.count > 1 ? 1800 + drop.count : undefined,
      });
      mapObjectsRef.current.markers.push(marker);
      if (drop.clustered) {
        marker.addListener("click", () => {
          const currentZoom = map.getZoom() || 11;
          map.panTo(marker.getPosition());
          map.setZoom(Math.min(currentZoom + 2, 18));
        });
      }
      bounds.extend(marker.getPosition());
      hasBounds = true;
    }

    const couriersToShow = showCouriers ? liveCouriers : [];
    for (const courier of couriersToShow) {
      const lat = courier.last_location?.lat;
      const lng = courier.last_location?.lng;
      if (lat === null || lng === null || lat === undefined || lng === undefined) continue;

      const marker = new maps.Marker({
        map,
        position: { lat, lng },
        title: `${courier.courier_name} (${courier.active_tasks})`,
        icon: buildCourierIcon(maps, courier.courier_user_id),
      });
      mapObjectsRef.current.markers.push(marker);
      const recordedAt = courier.last_location?.recorded_at
        ? formatDate(courier.last_location.recorded_at)
        : "—";
      const content = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:12px; line-height:1.4; min-width:180px;">
          <div style="font-weight:700; margin-bottom:3px;">${escapeHtml(courier.courier_name)}</div>
          <div>Задач в работе: <b>${courier.active_tasks}</b></div>
          <div>Смена: ${escapeHtml(courier.status)}</div>
          <div>Обновлено: ${escapeHtml(recordedAt)}</div>
        </div>
      `;
      marker.addListener("mouseover", () => {
        infoWindow.setContent(content);
        infoWindow.open({ map, anchor: marker });
      });
      marker.addListener("mouseout", () => {
        infoWindow.close();
      });
      bounds.extend(marker.getPosition());
      hasBounds = true;
    }

    if (hasBounds && !hasAutoFittedRef.current) {
      map.fitBounds(bounds, 60);
      hasAutoFittedRef.current = true;
    }
  }, [mapsReady, mapZoom, zones, dropPoints, liveCouriers, showCouriers, clearMapObjects]);

  return (
    <div className={styles.mapCard}>
      <div className={styles.mapOverlay}>
        <div className={styles.mapFilters}>
          <div className={styles.mapFiltersSection}>
            <span className={styles.mapFiltersLabel}>Цвет точек</span>
            <div className={styles.mapFiltersChips}>
              {availableColors.length === 0 ? (
                <span className={styles.legend}>Нет точек</span>
              ) : (
                availableColors.map((color) => (
                  <label key={color} className={styles.mapFilterChip}>
                    <input
                      type="checkbox"
                      checked={colorFilter.has(color)}
                      onChange={() => onColorFilterChange(color)}
                    />
                    <span
                      className={styles.mapFilterChipDot}
                      style={{
                        background: DROP_COLOR_HEX[color],
                      }}
                    />
                    {DROP_COLOR_LABEL[color]}
                  </label>
                ))
              )}
            </div>
          </div>
          <div className={styles.mapFiltersSection}>
            <label className={styles.mapFilterChip}>
              <input
                type="checkbox"
                checked={showCouriers}
                onChange={(e) => onShowCouriersChange(e.target.checked)}
              />
              <span className={styles.mapFilterChipDot} style={{ background: "#3b82f6" }} />
              Курьеры
            </label>
          </div>
        </div>
        <div className={styles.mapLegend}>
          <span className={styles.legend}>Зоны</span>
          <span className={styles.legend}>Дроп по цвету</span>
          <span className={styles.legend}>Курьеры (синий)</span>
        </div>
      </div>
      <div ref={mapCanvasRef} className={styles.mapCanvas} />
      {mapError && <div className={styles.mapNotice}>{mapError}</div>}
    </div>
  );
}

function ZoneEditorModal({
  open,
  apiKey,
  canEdit,
  seedZones,
  onClose,
  onUnauthorized,
  onZonesUpdated,
}: ZoneEditorModalProps) {
  const [zones, setZones] = useState<Zone[]>(seedZones);
  const [loadingZones, setLoadingZones] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const [zoneName, setZoneName] = useState("");
  const [zoneCode, setZoneCode] = useState("");
  const [zonePriority, setZonePriority] = useState("100");
  const [strokeColor, setStrokeColor] = useState(DEFAULT_ZONE_STYLE.strokeColor);
  const [fillColor, setFillColor] = useState(DEFAULT_ZONE_STYLE.fillColor);
  const [fillOpacity, setFillOpacity] = useState("0.20");
  const [draftPoints, setDraftPoints] = useState<Array<{ lat: number; lng: number }>>([]);

  const mapCanvasRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapsRef = useRef<any>(null);
  const clickListenerRef = useRef<any>(null);
  const draftMarkersRef = useRef<any[]>([]);
  const draftLineRef = useRef<any>(null);
  const draftPolygonRef = useRef<any>(null);

  const clearDraftObjects = useCallback(() => {
    for (const marker of draftMarkersRef.current) {
      marker.setMap(null);
    }
    draftMarkersRef.current = [];
    if (draftLineRef.current) {
      draftLineRef.current.setMap(null);
      draftLineRef.current = null;
    }
    if (draftPolygonRef.current) {
      draftPolygonRef.current.setMap(null);
      draftPolygonRef.current = null;
    }
  }, []);

  const fetchZones = useCallback(async (propagateToParent: boolean = false) => {
    if (!open) return;
    setLoadingZones(true);
    setModalError(null);
    try {
      const res = await fetch("/api/routeplanning/zones", { cache: "no-store" });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; zones?: Zone[]; error?: string }
        | null;
      if (!res.ok || !payload?.ok) {
        setModalError(payload?.error || "Не удалось загрузить список геозон");
        return;
      }
      const normalized = (payload.zones || []).map((zone) => ({
        ...zone,
        style: normalizeZoneStyle(zone.style),
      }));
      setZones(normalized);
      if (propagateToParent) {
        onZonesUpdated(normalized);
      }
    } catch (error: unknown) {
      setModalError(error instanceof Error ? error.message : "Ошибка загрузки геозон");
    } finally {
      setLoadingZones(false);
    }
  }, [onUnauthorized, onZonesUpdated, open]);

  useEffect(() => {
    if (!open) return;
    setZones(seedZones);
    setModalError(null);
    setModalMessage(null);
    void fetchZones(false);
  }, [fetchZones, open]);

  useEffect(() => {
    if (!open || !canEdit) return;
    let cancelled = false;
    void loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !mapCanvasRef.current) return;
        mapsRef.current = maps;
        if (!mapRef.current) {
          mapRef.current = new maps.Map(mapCanvasRef.current, {
            center: { lat: 40.4093, lng: 49.8671 },
            zoom: 11,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          });
        }
        if (clickListenerRef.current) {
          maps.event.removeListener(clickListenerRef.current);
        }
        clickListenerRef.current = mapRef.current.addListener("click", (event: any) => {
          const lat = event?.latLng?.lat?.();
          const lng = event?.latLng?.lng?.();
          if (typeof lat !== "number" || typeof lng !== "number") return;
          setDraftPoints((prev) => [...prev, { lat, lng }]);
        });
      })
      .catch((error: unknown) => {
        setModalError(error instanceof Error ? error.message : "Не удалось открыть карту геозон");
      });

    return () => {
      cancelled = true;
      if (clickListenerRef.current && mapsRef.current) {
        mapsRef.current.event.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
      }
      clearDraftObjects();
    };
  }, [apiKey, canEdit, clearDraftObjects, open]);

  useEffect(() => {
    if (!open || !canEdit || !mapRef.current || !mapsRef.current) return;
    clearDraftObjects();
    const maps = mapsRef.current;
    const map = mapRef.current;
    const style = normalizeZoneStyle({
      strokeColor,
      fillColor,
      fillOpacity: Number(fillOpacity),
    });

    draftPoints.forEach((point, index) => {
      const marker = new maps.Marker({
        map,
        position: point,
        draggable: true,
        label: {
          text: String(index + 1),
          color: "#ffffff",
          fontSize: "11px",
          fontWeight: "700",
        },
        title: `Точка ${index + 1}. Перетащите для коррекции, ПКМ для удаления`,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: style.strokeColor,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 1,
        },
      });
      marker.addListener("dragend", (event: any) => {
        const lat = event?.latLng?.lat?.();
        const lng = event?.latLng?.lng?.();
        if (typeof lat !== "number" || typeof lng !== "number") return;
        setDraftPoints((prev) =>
          prev.map((existing, existingIndex) =>
            existingIndex === index ? { lat, lng } : existing,
          ),
        );
      });
      marker.addListener("rightclick", () => {
        setDraftPoints((prev) => prev.filter((_, existingIndex) => existingIndex !== index));
      });
      draftMarkersRef.current.push(marker);
    });

    if (draftPoints.length >= 2) {
      draftLineRef.current = new maps.Polyline({
        map,
        path: draftPoints,
        strokeColor: style.strokeColor,
        strokeOpacity: 0.9,
        strokeWeight: 2,
      });
    }
    if (draftPoints.length >= 3) {
      draftPolygonRef.current = new maps.Polygon({
        map,
        paths: draftPoints,
        strokeColor: style.strokeColor,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: style.fillColor,
        fillOpacity: style.fillOpacity,
      });
    }
  }, [canEdit, clearDraftObjects, draftPoints, fillColor, fillOpacity, open, strokeColor]);

  const handleCreateZone = useCallback(async () => {
    if (!canEdit) return;
    const name = zoneName.trim();
    if (!name) {
      setModalError("Введите название зоны");
      return;
    }
    if (draftPoints.length < 3) {
      setModalError("Нарисуйте минимум 3 точки на карте");
      return;
    }

    setSaving(true);
    setModalError(null);
    setModalMessage(null);
    try {
      const res = await fetch("/api/routeplanning/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code: zoneCode.trim() || codeFromName(name),
          priority: Number(zonePriority) || 100,
          polygon: draftPoints,
          style: {
            strokeColor,
            fillColor,
            fillOpacity: Number(fillOpacity),
            strokeOpacity: 0.9,
            strokeWeight: 2,
          },
        }),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !payload?.ok) {
        setModalError(payload?.error || "Не удалось создать геозону");
        return;
      }

      setModalMessage("Геозона создана");
      setZoneName("");
      setZoneCode("");
      setZonePriority("100");
      setDraftPoints([]);
      await fetchZones(true);
    } catch (error: unknown) {
      setModalError(error instanceof Error ? error.message : "Ошибка создания зоны");
    } finally {
      setSaving(false);
    }
  }, [
    canEdit,
    draftPoints,
    fetchZones,
    fillColor,
    fillOpacity,
    onUnauthorized,
    strokeColor,
    zoneCode,
    zoneName,
    zonePriority,
  ]);

  const handleDeleteZone = useCallback(
    async (id: string, name: string) => {
      if (!canEdit) return;
      if (!window.confirm(`Удалить геозону "${name}"?`)) return;

      setDeletingId(id);
      setModalError(null);
      setModalMessage(null);
      try {
        const res = await fetch(`/api/routeplanning/zones?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || !payload?.ok) {
          setModalError(payload?.error || "Не удалось удалить геозону");
          return;
        }
        setModalMessage("Геозона удалена");
        await fetchZones(true);
      } catch (error: unknown) {
        setModalError(error instanceof Error ? error.message : "Ошибка удаления зоны");
      } finally {
        setDeletingId(null);
      }
    },
    [canEdit, fetchZones, onUnauthorized],
  );

  if (!open) return null;

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Редактирование геозон</h3>
            <p className={styles.modalSubtitle}>Сейчас активных зон: {zones.length}</p>
          </div>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            Закрыть
          </button>
        </div>

        {modalError && <div className={styles.error}>{modalError}</div>}
        {modalMessage && <div className={styles.message}>{modalMessage}</div>}

        <div className={styles.modalBody}>
          <div className={styles.modalColumn}>
            <div className={styles.listCard}>
              <div className={styles.listHeader}>
                <strong>Существующие зоны ({zones.length})</strong>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void fetchZones(false)}
                  disabled={loadingZones}
                >
                  Обновить
                </button>
              </div>
              <div className={styles.listBody}>
                {loadingZones ? (
                  <div className={styles.empty}>Загрузка зон...</div>
                ) : zones.length === 0 ? (
                  <div className={styles.empty}>Геозон пока нет</div>
                ) : (
                  zones.map((zone) => (
                    <div key={zone.id} className={styles.unitRow}>
                      <div className={styles.unitBarcode}>{zone.name}</div>
                      <div className={styles.unitMeta}>code: {zone.code}</div>
                      <div className={styles.zoneStyleRow}>
                        <span
                          className={styles.zoneColorDot}
                          style={{ background: normalizeZoneStyle(zone.style).fillColor }}
                        />
                        <span className={styles.unitMeta}>priority: {zone.priority}</span>
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          className={styles.zoneDeleteButton}
                          onClick={() => void handleDeleteZone(zone.id, zone.name)}
                          disabled={deletingId === zone.id}
                        >
                          {deletingId === zone.id ? "Удаление..." : "Удалить"}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className={styles.modalColumn}>
            <div className={styles.assignPanel}>
              <h4 className={styles.sectionTitle}>Создать новую зону</h4>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label}>Название зоны</label>
                  <input
                    className={styles.input}
                    value={zoneName}
                    onChange={(event) => setZoneName(event.target.value)}
                    placeholder="Например: Север-1"
                    disabled={!canEdit || saving}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Code (уникальный)</label>
                  <input
                    className={styles.input}
                    value={zoneCode}
                    onChange={(event) => setZoneCode(event.target.value)}
                    placeholder="auto if empty"
                    disabled={!canEdit || saving}
                  />
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label}>Цвет границы</label>
                  <input
                    className={styles.colorInput}
                    type="color"
                    value={strokeColor}
                    onChange={(event) => setStrokeColor(event.target.value)}
                    disabled={!canEdit || saving}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Цвет заливки</label>
                  <input
                    className={styles.colorInput}
                    type="color"
                    value={fillColor}
                    onChange={(event) => setFillColor(event.target.value)}
                    disabled={!canEdit || saving}
                  />
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label}>Прозрачность заливки</label>
                  <input
                    className={styles.input}
                    type="number"
                    min="0.05"
                    max="0.9"
                    step="0.05"
                    value={fillOpacity}
                    onChange={(event) => setFillOpacity(event.target.value)}
                    disabled={!canEdit || saving}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Priority</label>
                  <input
                    className={styles.input}
                    type="number"
                    min="1"
                    max="1000"
                    value={zonePriority}
                    onChange={(event) => setZonePriority(event.target.value)}
                    disabled={!canEdit || saving}
                  />
                </div>
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setDraftPoints((prev) => prev.slice(0, -1))}
                  disabled={!canEdit || saving || draftPoints.length === 0}
                >
                  Удалить последнюю точку
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setDraftPoints([])}
                  disabled={!canEdit || saving || draftPoints.length === 0}
                >
                  Очистить контур
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void handleCreateZone()}
                  disabled={!canEdit || saving}
                >
                  {saving ? "Сохранение..." : `Сохранить зону (${draftPoints.length} точек)`}
                </button>
              </div>
              <span className={styles.hint}>
                Клик по карте добавляет точку. Перетащите точку для коррекции, ПКМ по точке удаляет
                ее. Минимум 3 точки.
              </span>
            </div>

            <div className={styles.zoneEditorMapCard}>
              <div ref={mapCanvasRef} className={styles.zoneEditorMap} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CourierHistoryMap({
  apiKey,
  locations,
  events,
}: {
  apiKey: string;
  locations: CourierInsightsDetailResponse["locations"];
  events: CourierInsightsDetailResponse["events"];
}) {
  const mapCanvasRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const objectsRef = useRef<{
    polyline: any | null;
    marker: any | null;
    dots: any[];
    eventMarkers: any[];
  }>({
    polyline: null,
    marker: null,
    dots: [],
    eventMarkers: [],
  });
  const [mapsReady, setMapsReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [rangeStartIndex, setRangeStartIndex] = useState(0);
  const [rangeEndIndex, setRangeEndIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 4>(1);

  const timelinePoints = useMemo(
    () =>
      [...locations]
        .filter(
          (point) =>
            point.lat !== null &&
            point.lng !== null &&
            typeof point.lat === "number" &&
            typeof point.lng === "number",
        )
        .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at)),
    [locations],
  );

  useEffect(() => {
    if (timelinePoints.length === 0) {
      setRangeStartIndex(0);
      setRangeEndIndex(0);
      return;
    }
    setRangeStartIndex(0);
    setRangeEndIndex(timelinePoints.length - 1);
  }, [timelinePoints.length]);

  const clearObjects = useCallback(() => {
    if (objectsRef.current.polyline) {
      objectsRef.current.polyline.setMap(null);
      objectsRef.current.polyline = null;
    }
    if (objectsRef.current.marker) {
      objectsRef.current.marker.setMap(null);
      objectsRef.current.marker = null;
    }
    for (const dot of objectsRef.current.dots) {
      dot.setMap(null);
    }
    for (const marker of objectsRef.current.eventMarkers) {
      marker.setMap(null);
    }
    objectsRef.current.dots = [];
    objectsRef.current.eventMarkers = [];
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMapError(null);
    void loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !mapCanvasRef.current) return;
        if (!mapRef.current) {
          mapRef.current = new maps.Map(mapCanvasRef.current, {
            center: { lat: 40.4093, lng: 49.8671 },
            zoom: 11,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            clickableIcons: false,
          });
        }
        setMapsReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMapError(error instanceof Error ? error.message : "Не удалось загрузить карту трека");
      });

    return () => {
      cancelled = true;
      clearObjects();
    };
  }, [apiKey, clearObjects]);

  useEffect(() => {
    if (!mapsReady || !mapRef.current || !window.google?.maps) return;
    clearObjects();
    const maps = window.google.maps;
    const map = mapRef.current;
    if (timelinePoints.length === 0) return;

    const safeStart = Math.max(0, Math.min(rangeStartIndex, timelinePoints.length - 1));
    const safeEnd = Math.max(safeStart, Math.min(rangeEndIndex, timelinePoints.length - 1));
    const displayed = timelinePoints.slice(safeStart, safeEnd + 1);
    if (displayed.length === 0) return;
    const displayedStartMs = Date.parse(displayed[0].recorded_at);
    const displayedEndMs = Date.parse(displayed[displayed.length - 1].recorded_at);
    const eventsInDisplayedRange = events.filter((event) => {
      if (event.lat === null || event.lng === null) return false;
      const ts = Date.parse(event.happened_at);
      return Number.isFinite(ts) && ts >= displayedStartMs && ts <= displayedEndMs;
    });

    const path = displayed.map((point) => ({ lat: point.lat as number, lng: point.lng as number }));
    const bounds = new maps.LatLngBounds();
    for (const point of path) bounds.extend(point);
    map.fitBounds(bounds, 40);

    const polyline = new maps.Polyline({
      map,
      path,
      geodesic: true,
      strokeColor: "#2563eb",
      strokeOpacity: 0.9,
      strokeWeight: 3,
    });
    objectsRef.current.polyline = polyline;

    const head = path[path.length - 1];
    const marker = new maps.Marker({
      map,
      position: head,
      title: `Точка ${safeEnd + 1}/${timelinePoints.length}`,
      icon: {
        path: maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: "#16a34a",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      },
    });
    objectsRef.current.marker = marker;

    if (path.length > 2) {
      const step = Math.max(1, Math.floor(path.length / 24));
      for (let index = 0; index < path.length; index += step) {
        const dot = new maps.Marker({
          map,
          position: path[index],
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 3,
            fillColor: "#1d4ed8",
            fillOpacity: 0.8,
            strokeColor: "#ffffff",
            strokeWeight: 1,
          },
        });
        objectsRef.current.dots.push(dot);
      }
    }

    for (const event of eventsInDisplayedRange) {
      const color =
        event.event_type === "dropped"
          ? event.color_hex || "#ef4444"
          : event.event_type === "failed"
            ? "#f59e0b"
            : event.event_type === "returned"
              ? "#7c3aed"
              : "#0ea5e9";
      const eventMarker = new maps.Marker({
        map,
        position: { lat: event.lat as number, lng: event.lng as number },
        title: `${event.event_type} • ${formatDateTime(event.happened_at)}`,
        icon: {
          path: maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: 5,
          fillColor: color,
          fillOpacity: 0.95,
          strokeColor: "#ffffff",
          strokeWeight: 1,
          rotation: 90,
        },
      });
      objectsRef.current.eventMarkers.push(eventMarker);
      bounds.extend(eventMarker.getPosition());
    }
  }, [
    clearObjects,
    events,
    isPlaying,
    mapsReady,
    playbackSpeed,
    rangeEndIndex,
    rangeStartIndex,
    timelinePoints,
  ]);

  useEffect(() => {
    if (!isPlaying || timelinePoints.length <= 1) return;
    if (rangeEndIndex >= timelinePoints.length - 1) {
      setIsPlaying(false);
      return;
    }
    const stepMs = Math.max(140, Math.floor(680 / playbackSpeed));
    const timer = window.setInterval(() => {
      setRangeEndIndex((previous) => {
        if (previous >= timelinePoints.length - 1) {
          window.clearInterval(timer);
          setIsPlaying(false);
          return previous;
        }
        const next = Math.min(timelinePoints.length - 1, previous + 1);
        return next;
      });
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, playbackSpeed, rangeEndIndex, rangeStartIndex, timelinePoints.length]);

  const safeStart = Math.max(0, Math.min(rangeStartIndex, Math.max(timelinePoints.length - 1, 0)));
  const safeEnd = Math.max(safeStart, Math.min(rangeEndIndex, Math.max(timelinePoints.length - 1, 0)));
  const startPoint = timelinePoints[safeStart] || null;
  const endPoint = timelinePoints[safeEnd] || null;

  return (
    <div className={styles.historyMapCard}>
      <div className={styles.listHeader}>
        <strong>Карта маршрута по времени</strong>
        <span className={styles.unitMeta}>Точек: {timelinePoints.length}</span>
      </div>
      <div className={styles.historyMapCanvasWrap}>
        <div ref={mapCanvasRef} className={styles.historyMapCanvas} />
        {mapError && <div className={styles.mapNotice}>{mapError}</div>}
      </div>
      <div className={styles.historyMapControls}>
        <div className={styles.historyMapPlaybackRow}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              if (rangeEndIndex >= timelinePoints.length - 1) {
                setRangeStartIndex(0);
                setRangeEndIndex(0);
              }
              setIsPlaying((prev) => !prev);
            }}
            disabled={timelinePoints.length <= 1}
          >
            {isPlaying ? "Пауза" : "Проиграть"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              setIsPlaying(false);
              setRangeStartIndex(0);
              setRangeEndIndex(Math.max(0, timelinePoints.length - 1));
            }}
            disabled={timelinePoints.length <= 1}
          >
            Полный период
          </button>
          <label className={styles.historySpeedLabel}>
            Скорость
            <select
              className={styles.select}
              value={String(playbackSpeed)}
              onChange={(event) => setPlaybackSpeed(Number(event.target.value) as 1 | 2 | 4)}
            >
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="4">4x</option>
            </select>
          </label>
        </div>
        <div className={styles.historyMapRange}>
          <span className={styles.unitMeta}>Начало: {formatDateTime(startPoint?.recorded_at)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(0, timelinePoints.length - 1)}
            value={safeStart}
            onChange={(event) => {
              setIsPlaying(false);
              const next = Number(event.target.value);
              setRangeStartIndex(next);
              if (next > safeEnd) setRangeEndIndex(next);
            }}
            disabled={timelinePoints.length <= 1}
          />
        </div>
        <div className={styles.historyMapRange}>
          <span className={styles.unitMeta}>Конец: {formatDateTime(endPoint?.recorded_at)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(0, timelinePoints.length - 1)}
            value={safeEnd}
            onChange={(event) => {
              setIsPlaying(false);
              const next = Number(event.target.value);
              setRangeEndIndex(next);
              if (next < safeStart) setRangeStartIndex(next);
            }}
            disabled={timelinePoints.length <= 1}
          />
        </div>
        <div className={styles.historyLegendRow}>
          <span className={styles.legend}>Синий: трек</span>
          <span className={styles.legend}>Зеленый: текущая точка</span>
          <span className={styles.legend}>Дроп: красный/желтый/фиолетовый/серый/черный/зеленый</span>
          <span className={styles.legend}>Желтый: failed</span>
          <span className={styles.legend}>Фиолетовый: returned</span>
        </div>
      </div>
    </div>
  );
}

function CourierInsightsModal({ open, onClose, onUnauthorized, apiKey }: CourierInsightsModalProps) {
  const [cards, setCards] = useState<CourierCardSummary[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [selectedCourierId, setSelectedCourierId] = useState<string>("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CourierInsightsDetailResponse | null>(null);
  const [searchCourier, setSearchCourier] = useState("");
  const [fromLocal, setFromLocal] = useState(
    toDateTimeLocalValue(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  );
  const [toLocal, setToLocal] = useState(toDateTimeLocalValue(new Date().toISOString()));
  const [eventType, setEventType] = useState("");
  const [taskStatus, setTaskStatus] = useState("");
  const [shiftStatus, setShiftStatus] = useState("");
  const [handoverStatus, setHandoverStatus] = useState("");

  const fetchCards = useCallback(async () => {
    if (!open) return;
    setCardsLoading(true);
    setCardsError(null);
    try {
      const params = new URLSearchParams();
      const fromIso = fromDateTimeLocalValue(fromLocal);
      const toIso = fromDateTimeLocalValue(toLocal);
      if (fromIso) params.set("from", fromIso);
      if (toIso) params.set("to", toIso);

      const res = await fetch(`/api/routeplanning/couriers?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const payload = (await res.json().catch(() => null)) as CourierInsightsListResponse | null;
      if (!res.ok || !payload?.ok) {
        setCardsError(payload?.error || "Не удалось загрузить список курьеров");
        return;
      }
      setCards(payload.couriers || []);
      if ((payload.couriers || []).length > 0) {
        setSelectedCourierId((prev) =>
          prev && payload.couriers.some((item) => item.courier_user_id === prev)
            ? prev
            : payload.couriers[0].courier_user_id,
        );
      } else {
        setSelectedCourierId("");
      }
    } catch (error: unknown) {
      setCardsError(error instanceof Error ? error.message : "Ошибка загрузки курьеров");
    } finally {
      setCardsLoading(false);
    }
  }, [fromLocal, onUnauthorized, open, toLocal]);

  const fetchDetails = useCallback(async () => {
    if (!open || !selectedCourierId) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const params = new URLSearchParams();
      params.set("courierUserId", selectedCourierId);
      const fromIso = fromDateTimeLocalValue(fromLocal);
      const toIso = fromDateTimeLocalValue(toLocal);
      if (fromIso) params.set("from", fromIso);
      if (toIso) params.set("to", toIso);
      if (eventType.trim()) params.set("eventType", eventType.trim());
      if (taskStatus.trim()) params.set("taskStatus", taskStatus.trim());
      if (shiftStatus.trim()) params.set("shiftStatus", shiftStatus.trim());
      if (handoverStatus.trim()) params.set("handoverStatus", handoverStatus.trim());

      const res = await fetch(`/api/routeplanning/couriers?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const payload = (await res.json().catch(() => null)) as CourierInsightsDetailResponse | null;
      if (!res.ok || !payload?.ok) {
        setDetailError(payload?.error || "Не удалось загрузить детали курьера");
        return;
      }
      setDetail(payload);
    } catch (error: unknown) {
      setDetailError(error instanceof Error ? error.message : "Ошибка загрузки деталей");
    } finally {
      setDetailLoading(false);
    }
  }, [
    eventType,
    fromLocal,
    handoverStatus,
    onUnauthorized,
    open,
    selectedCourierId,
    shiftStatus,
    taskStatus,
    toLocal,
  ]);

  useEffect(() => {
    if (!open) return;
    void fetchCards();
  }, [fetchCards, open]);

  useEffect(() => {
    if (!open || !selectedCourierId) return;
    void fetchDetails();
  }, [fetchDetails, open, selectedCourierId]);

  const filteredCards = useMemo(() => {
    const query = searchCourier.trim().toLowerCase();
    if (!query) return cards;
    return cards.filter((item) => item.courier_name.toLowerCase().includes(query));
  }, [cards, searchCourier]);

  if (!open) return null;

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={`${styles.modal} ${styles.courierInsightsModal}`} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Архив и аналитика курьеров</h3>
            <p className={styles.modalSubtitle}>
              Карточки всех курьеров + фильтры для полного просмотра истории
            </p>
          </div>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className={styles.courierInsightsFilters}>
          <div className={styles.field}>
            <label className={styles.label}>Период от</label>
            <input
              className={styles.input}
              type="datetime-local"
              value={fromLocal}
              onChange={(event) => setFromLocal(event.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Период до</label>
            <input
              className={styles.input}
              type="datetime-local"
              value={toLocal}
              onChange={(event) => setToLocal(event.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Событие</label>
            <select className={styles.select} value={eventType} onChange={(event) => setEventType(event.target.value)}>
              <option value="">Все события</option>
              <option value="claimed">claimed</option>
              <option value="accepted">accepted</option>
              <option value="arrived">arrived</option>
              <option value="dropped">dropped</option>
              <option value="delivered">delivered</option>
              <option value="failed">failed</option>
              <option value="returned">returned</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Статус задачи</label>
            <select className={styles.select} value={taskStatus} onChange={(event) => setTaskStatus(event.target.value)}>
              <option value="">Все статусы задач</option>
              <option value="claimed">claimed</option>
              <option value="in_route">in_route</option>
              <option value="arrived">arrived</option>
              <option value="dropped">dropped</option>
              <option value="delivered">delivered</option>
              <option value="failed">failed</option>
              <option value="returned">returned</option>
              <option value="canceled">canceled</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Статус смены</label>
            <select className={styles.select} value={shiftStatus} onChange={(event) => setShiftStatus(event.target.value)}>
              <option value="">Все статусы смен</option>
              <option value="open">open</option>
              <option value="closing">closing</option>
              <option value="closed">closed</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Handover</label>
            <select
              className={styles.select}
              value={handoverStatus}
              onChange={(event) => setHandoverStatus(event.target.value)}
            >
              <option value="">Все handover статусы</option>
              <option value="draft">draft</option>
              <option value="confirmed">confirmed</option>
            </select>
          </div>
          <button type="button" className={styles.secondaryButton} onClick={() => void fetchCards()}>
            Обновить список
          </button>
          <button type="button" className={styles.primaryButton} onClick={() => void fetchDetails()} disabled={!selectedCourierId}>
            Применить фильтры
          </button>
        </div>

        {cardsError && <div className={styles.error}>{cardsError}</div>}
        {detailError && <div className={styles.error}>{detailError}</div>}

        <div className={styles.courierInsightsBody}>
          <div className={styles.courierInsightsSidebar}>
            <div className={styles.listHeader}>
              <strong>Курьеры в системе ({cards.length})</strong>
              <input
                className={styles.input}
                style={{ maxWidth: 210 }}
                placeholder="Поиск курьера"
                value={searchCourier}
                onChange={(event) => setSearchCourier(event.target.value)}
              />
            </div>
            <div className={styles.courierIosCards}>
              {cardsLoading ? (
                <div className={styles.empty}>Загрузка курьеров...</div>
              ) : filteredCards.length === 0 ? (
                <div className={styles.empty}>Курьеры не найдены</div>
              ) : (
                filteredCards.map((card) => {
                  const selected = card.courier_user_id === selectedCourierId;
                  return (
                    <button
                      key={card.courier_user_id}
                      type="button"
                      className={`${styles.courierIosCard} ${selected ? styles.courierIosCardActive : ""}`}
                      onClick={() => setSelectedCourierId(card.courier_user_id)}
                    >
                      <div className={styles.courierIosCardTop}>
                        <span className={styles.courierIosName}>{card.courier_name}</span>
                        <span className={styles.courierIosRole}>{card.role}</span>
                      </div>
                      <div className={styles.courierIosMeta}>
                        Активных задач: {card.active_tasks} • Дропов: {card.stats.dropped}
                      </div>
                      <div className={styles.courierIosMeta}>
                        Смена: {card.open_shift?.status || "не активна"} •
                        {" "}
                        Last event: {formatDateTime(card.stats.lastEventAt)}
                      </div>
                      <div className={styles.courierIosMeta}>
                        Last GPS: {formatDateTime(card.last_location?.recorded_at)}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className={styles.courierInsightsContent}>
            {!selectedCourierId ? (
              <div className={styles.empty}>Выберите курьера в левой колонке</div>
            ) : detailLoading ? (
              <div className={styles.empty}>Загрузка деталей курьера...</div>
            ) : !detail ? (
              <div className={styles.empty}>Нет данных по выбранному курьеру</div>
            ) : (
              <>
                <div className={styles.courierSummaryGrid}>
                  <div className={styles.courierSummaryCard}>
                    <div className={styles.courierSummaryLabel}>Курьер</div>
                    <div className={styles.courierSummaryValue}>{detail.courier.courier_name}</div>
                    <div className={styles.courierMeta}>ID: {detail.courier.courier_user_id}</div>
                  </div>
                  <div className={styles.courierSummaryCard}>
                    <div className={styles.courierSummaryLabel}>Маршрут</div>
                    <div className={styles.courierSummaryValue}>{detail.summary.distance_km} км</div>
                    <div className={styles.courierMeta}>
                      Точек GPS: {detail.summary.location_points_count}
                    </div>
                  </div>
                  <div className={styles.courierSummaryCard}>
                    <div className={styles.courierSummaryLabel}>События</div>
                    <div className={styles.courierSummaryValue}>{detail.summary.events_count}</div>
                    <div className={styles.courierMeta}>Задач: {detail.summary.tasks_count}</div>
                  </div>
                  <div className={styles.courierSummaryCard}>
                    <div className={styles.courierSummaryLabel}>Смены / handover</div>
                    <div className={styles.courierSummaryValue}>
                      {detail.summary.shifts_count} / {detail.summary.handovers_count}
                    </div>
                    <div className={styles.courierMeta}>
                      Период: {formatDateTime(detail.from)} - {formatDateTime(detail.to)}
                    </div>
                  </div>
                </div>

                <CourierHistoryMap apiKey={apiKey} locations={detail.locations} events={detail.events} />

                <div className={styles.courierBreakdownRow}>
                  <div className={styles.courierBreakdownCard}>
                    <strong>Статусы смен</strong>
                    <div className={styles.courierBreakdownItems}>
                      {Object.entries(detail.summary.shift_status_breakdown).map(([key, value]) => (
                        <span key={key} className={styles.chip}>
                          {key}: {value}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className={styles.courierBreakdownCard}>
                    <strong>Статусы задач</strong>
                    <div className={styles.courierBreakdownItems}>
                      {Object.entries(detail.summary.task_status_breakdown).map(([key, value]) => (
                        <span key={key} className={styles.chip}>
                          {key}: {value}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className={styles.courierBreakdownCard}>
                    <strong>Типы событий</strong>
                    <div className={styles.courierBreakdownItems}>
                      {Object.entries(detail.summary.event_breakdown).map(([key, value]) => (
                        <span key={key} className={styles.chip}>
                          {key}: {value}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={styles.courierDetailsGrid}>
                  <div className={styles.listCard}>
                    <div className={styles.listHeader}>
                      <strong>Смены ({detail.shifts.length})</strong>
                    </div>
                    <div className={styles.listBody}>
                      {detail.shifts.length === 0 ? (
                        <div className={styles.empty}>Нет смен по выбранным фильтрам</div>
                      ) : (
                        detail.shifts.map((shift) => (
                          <div key={shift.id} className={styles.unitRow}>
                            <div className={styles.unitMeta}>ID: {shift.id}</div>
                            <div className={styles.unitMeta}>Статус: {shift.status}</div>
                            <div className={styles.unitMeta}>Старт: {formatDateTime(shift.started_at)}</div>
                            <div className={styles.unitMeta}>Закрытие: {formatDateTime(shift.closed_at)}</div>
                            {shift.start_note ? <span className={styles.chip}>start: {shift.start_note}</span> : null}
                            {shift.close_note ? <span className={styles.chip}>close: {shift.close_note}</span> : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className={styles.listCard}>
                    <div className={styles.listHeader}>
                      <strong>Задачи ({detail.tasks.length})</strong>
                    </div>
                    <div className={styles.listBody}>
                      {detail.tasks.length === 0 ? (
                        <div className={styles.empty}>Нет задач по фильтрам</div>
                      ) : (
                        detail.tasks.map((task) => (
                          <div key={task.id} className={styles.unitRow}>
                            <div className={styles.unitBarcode}>#{task.unit.barcode || task.unit.id}</div>
                            <div className={styles.unitMeta}>task_id: {task.id}</div>
                            <div className={styles.unitMeta}>status: {task.status}</div>
                            <div className={styles.unitMeta}>last_event: {formatDateTime(task.last_event_at)}</div>
                            {task.fail_reason ? (
                              <span className={styles.chip}>fail: {task.fail_reason}</span>
                            ) : null}
                            {task.fail_comment ? (
                              <span className={styles.chip}>comment: {task.fail_comment}</span>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className={styles.listCard}>
                    <div className={styles.listHeader}>
                      <strong>События ({detail.events.length})</strong>
                    </div>
                    <div className={styles.listBody}>
                      {detail.events.length === 0 ? (
                        <div className={styles.empty}>Нет событий по фильтрам</div>
                      ) : (
                        detail.events.map((event) => (
                          <div key={event.id} className={styles.unitRow}>
                            <div className={styles.unitMeta}>{event.event_type}</div>
                            <div className={styles.unitMeta}>#{event.unit.barcode || event.unit.id}</div>
                            <div className={styles.unitMeta}>{formatDateTime(event.happened_at)}</div>
                            <div className={styles.unitMeta}>
                              lat/lng: {event.lat ?? "—"} / {event.lng ?? "—"}
                            </div>
                            {event.note ? <span className={styles.chip}>{event.note}</span> : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className={styles.listCard}>
                    <div className={styles.listHeader}>
                      <strong>GPS точки ({detail.locations.length})</strong>
                    </div>
                    <div className={styles.listBody}>
                      {detail.locations.length === 0 ? (
                        <div className={styles.empty}>Нет GPS данных в периоде</div>
                      ) : (
                        detail.locations.map((location) => (
                          <div key={location.id} className={styles.unitRow}>
                            <div className={styles.unitMeta}>{formatDateTime(location.recorded_at)}</div>
                            <div className={styles.unitMeta}>
                              lat/lng: {location.lat ?? "—"} / {location.lng ?? "—"}
                            </div>
                            <div className={styles.unitMeta}>
                              accuracy: {location.accuracy_m ?? "—"}m • speed: {location.speed_m_s ?? "—"}
                            </div>
                            <div className={styles.unitMeta}>
                              heading: {location.heading_deg ?? "—"} • battery: {location.battery_level ?? "—"}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className={styles.listCard}>
                    <div className={styles.listHeader}>
                      <strong>Handover ({detail.handovers.length})</strong>
                    </div>
                    <div className={styles.listBody}>
                      {detail.handovers.length === 0 ? (
                        <div className={styles.empty}>Нет handover по фильтрам</div>
                      ) : (
                        detail.handovers.map((handover) => (
                          <div key={handover.id} className={styles.unitRow}>
                            <div className={styles.unitMeta}>ID: {handover.id}</div>
                            <div className={styles.unitMeta}>status: {handover.status}</div>
                            <div className={styles.unitMeta}>start: {formatDateTime(handover.started_at)}</div>
                            <div className={styles.unitMeta}>
                              confirm: {formatDateTime(handover.confirmed_at)}
                            </div>
                            {handover.note ? <span className={styles.chip}>{handover.note}</span> : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RoutePlanningClient({
  initialRole,
  initialCanEdit,
  mapsApiKey,
}: RoutePlanningClientProps) {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [selectedCourierUserId, setSelectedCourierUserId] = useState("");
  const [selectedPickingUnitIds, setSelectedPickingUnitIds] = useState<Set<string>>(new Set());
  const [selectedDroppedUnitIds, setSelectedDroppedUnitIds] = useState<Set<string>>(new Set());
  const [droppedColorFilter, setDroppedColorFilter] = useState<Set<DropColor>>(
    new Set(DROP_COLOR_ORDER),
  );
  const [searchPicking, setSearchPicking] = useState("");
  const [searchDropped, setSearchDropped] = useState("");
  const [zoneEditorOpen, setZoneEditorOpen] = useState(false);
  const [courierInsightsOpen, setCourierInsightsOpen] = useState(false);
  const [colorsInfoOpen, setColorsInfoOpen] = useState(false);
  const [showCouriersOnMap, setShowCouriersOnMap] = useState(true);
  const [leftPaneWidthPct, setLeftPaneWidthPct] = useState(52);
  const [isResizing, setIsResizing] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const [listsPickingHeightPct, setListsPickingHeightPct] = useState(40);
  const [isListsResizing, setIsListsResizing] = useState(false);
  const listsWrapRef = useRef<HTMLDivElement | null>(null);
  const [mainHeights, setMainHeights] = useState({ mainAreaPx: 450, couriersStripPx: 220 });
  const [isMainCouriersResizing, setIsMainCouriersResizing] = useState(false);
  const mainCouriersWrapRef = useRef<HTMLDivElement | null>(null);

  const canEdit = dashboard?.can_edit ?? initialCanEdit;
  const effectiveRole = dashboard?.role || initialRole;
  const handleUnauthorized = useCallback(() => {
    router.push("/login");
  }, [router]);

  const loadDashboard = useCallback(
    async (silent: boolean) => {
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await fetch("/api/routeplanning/dashboard", { cache: "no-store" });
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 403) {
          setError("У вас нет доступа к Route Planning");
          return;
        }

        const json = (await res.json()) as DashboardResponse & { error?: string };
        if (!res.ok || !json.ok) {
          setError(json.error || "Ошибка загрузки Route Planning");
          return;
        }

        setDashboard(json);
      } catch (loadError: unknown) {
        const messageText =
          loadError instanceof Error ? loadError.message : "Ошибка загрузки данных";
        setError(messageText);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [router],
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem("routeplanning-left-pane-width");
      const n = Number(saved);
      if (Number.isFinite(n) && n >= 15 && n <= 90) setLeftPaneWidthPct(n);
      const savedLists = localStorage.getItem("routeplanning-lists-picking-height");
      const nLists = Number(savedLists);
      if (Number.isFinite(nLists) && nLists >= 10 && nLists <= 90) setListsPickingHeightPct(nLists);
      const savedMain = localStorage.getItem("routeplanning-main-area-height-px");
      const nMain = Number(savedMain);
      const savedCouriers = localStorage.getItem("routeplanning-couriers-strip-height-px");
      const nCouriers = Number(savedCouriers);
      if (Number.isFinite(nMain) && nMain >= 200 && Number.isFinite(nCouriers) && nCouriers >= 100) {
        setMainHeights({ mainAreaPx: nMain, couriersStripPx: nCouriers });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadDashboard(false);
    const intervalId = window.setInterval(() => {
      void loadDashboard(true);
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [loadDashboard]);

  useEffect(() => {
    if (!dashboard) return;
    const validPickingUnitIds = new Set(dashboard.picking_units.map((unit) => unit.id));
    const validDroppedUnitIds = new Set(dashboard.dropped_units.map((unit) => unit.unit_id));
    const onShiftCourierIds = new Set(
      (dashboard.live_couriers || []).map((courier) => courier.courier_user_id),
    );

    setSelectedPickingUnitIds((prev) => {
      const next = new Set([...prev].filter((unitId) => validPickingUnitIds.has(unitId)));
      if (next.size === prev.size) return prev;
      return next;
    });
    setSelectedDroppedUnitIds((prev) => {
      const next = new Set([...prev].filter((unitId) => validDroppedUnitIds.has(unitId)));
      if (next.size === prev.size) return prev;
      return next;
    });
    if (selectedCourierUserId && !onShiftCourierIds.has(selectedCourierUserId)) {
      setSelectedCourierUserId("");
    }
  }, [dashboard, selectedCourierUserId]);

  const assignableCouriers = useMemo(() => {
    const map = new Map<string, string>();
    for (const courier of dashboard?.live_couriers || []) {
      if (!map.has(courier.courier_user_id)) {
        map.set(courier.courier_user_id, courier.courier_name);
      }
    }
    return Array.from(map.entries()).map(([id, full_name]) => ({ id, full_name }));
  }, [dashboard?.live_couriers]);

  const selectedCourier = useMemo(
    () => assignableCouriers.find((courier) => courier.id === selectedCourierUserId) || null,
    [assignableCouriers, selectedCourierUserId],
  );

  const filteredPickingUnits = useMemo(() => {
    const units = dashboard?.picking_units || [];
    const q = searchPicking.trim().toLowerCase();
    if (!q) return units;
    return units.filter((unit) => {
      const barcode = unit.barcode.toLowerCase();
      const cellCode = unit.cell?.code?.toLowerCase() || "";
      const scenario = unit.scenario?.toLowerCase() || "";
      return barcode.includes(q) || cellCode.includes(q) || scenario.includes(q);
    });
  }, [dashboard?.picking_units, searchPicking]);

  const filteredDroppedUnits = useMemo(() => {
    const units = dashboard?.dropped_units || [];
    const q = searchDropped.trim().toLowerCase();
    return units.filter((unit) => {
      if (!droppedColorFilter.has(unit.color_key)) return false;
      if (!q) return true;
      const barcode = unit.unit_barcode.toLowerCase();
      const courierName = unit.courier_name.toLowerCase();
      const opsStatus = (unit.ops_status || "").toLowerCase();
      return barcode.includes(q) || courierName.includes(q) || opsStatus.includes(q);
    });
  }, [dashboard?.dropped_units, droppedColorFilter, searchDropped]);

  const filteredDropPoints = useMemo(
    () =>
      (dashboard?.drop_points || []).filter((point) => droppedColorFilter.has(point.color_key)),
    [dashboard?.drop_points, droppedColorFilter],
  );
  const availableDroppedColors = useMemo(
    () =>
      DROP_COLOR_ORDER.filter((color) =>
        (dashboard?.dropped_units || []).some((unit) => unit.color_key === color),
      ),
    [dashboard?.dropped_units],
  );

  const togglePickingUnit = useCallback((unitId: string) => {
    setSelectedPickingUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  }, []);

  const toggleDroppedUnit = useCallback((unitId: string) => {
    setSelectedDroppedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPickingUnitIds(new Set());
    setSelectedDroppedUnitIds(new Set());
    setSelectedCourierUserId("");
  }, []);

  const toggleDroppedColorFilter = useCallback((color: DropColor) => {
    setDroppedColorFilter((prev) => {
      const next = new Set(prev);
      if (next.has(color)) {
        next.delete(color);
      } else {
        next.add(color);
      }
      return next.size > 0 ? next : new Set([color]);
    });
  }, []);

  const assignSelectedUnits = useCallback(async (source: "picking" | "dropped") => {
    if (!canEdit) return;
    const selectedSourceUnitIds =
      source === "picking" ? selectedPickingUnitIds : selectedDroppedUnitIds;
    if (selectedSourceUnitIds.size === 0) {
      setError(
        source === "picking"
          ? "Выберите хотя бы один заказ из picking"
          : "Выберите хотя бы один заказ из списка dropped",
      );
      return;
    }
    if (!selectedCourierUserId) {
      setError("Выберите курьера на смене");
      return;
    }

    setAssigning(true);
    setError(null);
    setMessage(null);

    try {
      const unitIds = Array.from(selectedSourceUnitIds);
      const response = await fetch("/api/routeplanning/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitIds,
          courierUserId: selectedCourierUserId,
          source,
        }),
      });

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      const payload = (await response.json().catch(() => null)) as AssignResponse | null;
      const successCount = payload?.success_count || 0;
      const failedCount = payload?.failed_count || 0;

      if (!response.ok && successCount === 0) {
        setError(payload?.error || "Не удалось отправить заказы");
        return;
      }

      if (successCount > 0) {
        const courierLabel = selectedCourier?.full_name || "курьер";
        const sourceLabel = source === "picking" ? "из picking" : "из точек";
        setMessage(`Отправлено ${successCount} заказ(ов) ${sourceLabel} курьеру ${courierLabel}`);
        if (failedCount === 0) {
          if (source === "picking") {
            setSelectedPickingUnitIds(new Set());
          } else {
            setSelectedDroppedUnitIds(new Set());
          }
        } else {
          const failedIds = new Set((payload?.failed || []).map((item) => item.unit_id));
          if (source === "picking") {
            setSelectedPickingUnitIds(failedIds);
          } else {
            setSelectedDroppedUnitIds(failedIds);
          }
        }
        await loadDashboard(true);
      }
      if (failedCount > 0) {
        const sampleError = payload?.failed?.find((item) => item.error)?.error;
        const sampleText = sampleError ? ` (${sampleError})` : "";
        setError(`Не удалось отправить ${failedCount} заказ(ов)${sampleText}`);
      }
    } catch (assignError: unknown) {
      const messageText =
        assignError instanceof Error ? assignError.message : "Ошибка отправки заказов";
      setError(messageText);
    } finally {
      setAssigning(false);
    }
  }, [
    canEdit,
    loadDashboard,
    router,
    selectedCourier,
    selectedCourierUserId,
    selectedDroppedUnitIds,
    selectedPickingUnitIds,
  ]);

  const handleZonesUpdated = useCallback(
    (zones: Zone[]) => {
      setDashboard((prev) => (prev ? { ...prev, zones } : prev));
    },
    [],
  );

  const handleResizeStart = useCallback(() => setIsResizing(true), []);
  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
      const clamped = Math.max(15, Math.min(90, pct));
      setLeftPaneWidthPct(clamped);
      try {
        localStorage.setItem("routeplanning-left-pane-width", String(clamped));
      } catch {
        /* ignore */
      }
    },
    [isResizing],
  );
  const handleResizeEnd = useCallback(() => setIsResizing(false), []);

  const handleListsResizeStart = useCallback(() => setIsListsResizing(true), []);
  const handleListsResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!isListsResizing || !listsWrapRef.current) return;
      const rect = listsWrapRef.current.getBoundingClientRect();
      const pct = Math.round(((e.clientY - rect.top) / rect.height) * 100);
      const clamped = Math.max(10, Math.min(90, pct));
      setListsPickingHeightPct(clamped);
      try {
        localStorage.setItem("routeplanning-lists-picking-height", String(clamped));
      } catch {
        /* ignore */
      }
    },
    [isListsResizing],
  );
  const handleListsResizeEnd = useCallback(() => setIsListsResizing(false), []);

  const handleMainCouriersResizeStart = useCallback(() => setIsMainCouriersResizing(true), []);
  const handleMainCouriersResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!isMainCouriersResizing || !mainCouriersWrapRef.current) return;
      const wrap = mainCouriersWrapRef.current;
      const rect = wrap.getBoundingClientRect();
      const yInContent = wrap.scrollTop + (e.clientY - rect.top);
      setMainHeights((prev) => {
        const total = prev.mainAreaPx + 8 + prev.couriersStripPx;
        const newMain = Math.max(200, Math.round(yInContent));
        const newCouriers = Math.max(100, total - newMain - 8);
        try {
          localStorage.setItem("routeplanning-main-area-height-px", String(newMain));
          localStorage.setItem("routeplanning-couriers-strip-height-px", String(newCouriers));
        } catch {
          /* ignore */
        }
        return { mainAreaPx: newMain, couriersStripPx: newCouriers };
      });
    },
    [isMainCouriersResizing],
  );
  const handleMainCouriersResizeEnd = useCallback(() => setIsMainCouriersResizing(false), []);

  useEffect(() => {
    if (!isResizing) return;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (e: MouseEvent) => handleResizeMove(e);
    const onUp = () => {
      handleResizeEnd();
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  useEffect(() => {
    if (!isListsResizing) return;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    const onMove = (e: MouseEvent) => handleListsResizeMove(e);
    const onUp = () => {
      handleListsResizeEnd();
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isListsResizing, handleListsResizeMove, handleListsResizeEnd]);

  useEffect(() => {
    if (!isMainCouriersResizing) return;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    const onMove = (e: MouseEvent) => handleMainCouriersResizeMove(e);
    const onUp = () => {
      handleMainCouriersResizeEnd();
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isMainCouriersResizing, handleMainCouriersResizeMove, handleMainCouriersResizeEnd]);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => router.push("/app/warehouse-map")}
          >
            ← В главное меню
          </button>
          <div className={styles.titleWrap}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 className={styles.title}>Route Planning</h1>
              <button
                type="button"
                onClick={() => setColorsInfoOpen(true)}
                title="Легенда цветов точек дропа"
                aria-label="Легенда цветов точек дропа"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  border: "1px solid #94a3b8",
                  background: "#f8fafc",
                  color: "#64748b",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                i
              </button>
            </div>
            <p className={styles.subtitle}>
              Split view: назначение из picking + live карта курьеров
            </p>
          </div>
        </div>

        <div className={styles.toolbarRight}>
          <span className={styles.badge}>Роль: {getRoleLabel(effectiveRole)}</span>
          {canEdit ? (
            <button
              type="button"
              className={`${styles.secondaryButton} ${styles.zoneEditToolbarButton}`}
              onClick={() => setZoneEditorOpen(true)}
            >
              Редактирование геозон ({dashboard?.zones.length || 0})
            </button>
          ) : (
            <span className={`${styles.badge} ${styles.badgeReadonly}`}>Только просмотр</span>
          )}
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void loadDashboard(false)}
            disabled={loading || assigning}
          >
            Обновить
          </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.message}>{message}</div>}

      <div
        ref={mainCouriersWrapRef}
        className={styles.mainCouriersWrap}
        style={{ cursor: isMainCouriersResizing ? "row-resize" : undefined }}
      >
        <div
          className={styles.mainCouriersInner}
          style={{ height: mainHeights.mainAreaPx + 8 + mainHeights.couriersStripPx }}
        >
        <div
          className={styles.mainArea}
          style={{ height: mainHeights.mainAreaPx }}
        >
          <div
            ref={splitContainerRef}
            className={styles.split}
            style={{ cursor: isResizing ? "col-resize" : undefined }}
          >
        <div
          className={`${styles.pane} ${styles.paneLeft}`}
          style={{ width: `${leftPaneWidthPct}%` }}
        >
          <div className={styles.paneInner}>
            <h2 className={styles.sectionTitle}>Заказы и назначения</h2>

            <div className={styles.assignPanel}>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="routeplanning-courier">
                    Курьер на смене
                  </label>
                  <select
                    id="routeplanning-courier"
                    className={styles.select}
                    value={selectedCourierUserId}
                    onChange={(event) => setSelectedCourierUserId(event.target.value)}
                    disabled={!canEdit || assigning || loading}
                  >
                    <option value="">Выберите курьера</option>
                    {assignableCouriers.map((courier) => (
                      <option key={courier.id} value={courier.id}>
                        {courier.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Выбранный курьер</label>
                  <div className={styles.input}>
                    {selectedCourier?.full_name || "Курьер не выбран"}
                  </div>
                </div>
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void assignSelectedUnits("picking")}
                  disabled={
                    !canEdit ||
                    assigning ||
                    selectedPickingUnitIds.size === 0 ||
                    !selectedCourierUserId
                  }
                >
                  {assigning
                    ? "Отправка..."
                    : `Передать из picking (${selectedPickingUnitIds.size})`}
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void assignSelectedUnits("dropped")}
                  disabled={
                    !canEdit ||
                    assigning ||
                    selectedDroppedUnitIds.size === 0 ||
                    !selectedCourierUserId
                  }
                >
                  {assigning
                    ? "Отправка..."
                    : `Передать из точек (${selectedDroppedUnitIds.size})`}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={clearSelection}
                  disabled={!canEdit || assigning}
                >
                  Сбросить выбор
                </button>
                <span className={styles.hint}>
                  {canEdit
                    ? "Назначение доступно только logistics/admin и только курьерам с открытой сменой."
                    : "Режим чтения: без изменения назначений."}
                </span>
              </div>
            </div>

            <div
              ref={listsWrapRef}
              className={styles.listsWrap}
              style={{ cursor: isListsResizing ? "row-resize" : undefined }}
            >
              <div
                className={styles.listsWrapPicking}
                style={{ height: `${listsPickingHeightPct}%` }}
              >
                <div className={styles.listCard}>
                  <div className={styles.listHeader}>
                    <strong>Picking ({filteredPickingUnits.length})</strong>
                  <input
                    className={styles.input}
                    style={{ maxWidth: 220 }}
                    value={searchPicking}
                    onChange={(event) => setSearchPicking(event.target.value)}
                    placeholder="Поиск по barcode/cell/scenario"
                  />
                </div>
                <div className={styles.listBody}>
                  {loading && !dashboard ? (
                    <div className={styles.empty}>Загрузка picking...</div>
                  ) : filteredPickingUnits.length === 0 ? (
                    <div className={styles.empty}>Нет заказов в picking</div>
                  ) : (
                    filteredPickingUnits.map((unit) => {
                      const isSelected = selectedPickingUnitIds.has(unit.id);
                      const cellDescription = unit.cell?.meta?.description
                        ? ` (${unit.cell.meta.description})`
                        : "";
                      return (
                        <div
                          key={unit.id}
                          className={`${styles.unitRow} ${
                            isSelected ? styles.unitRowSelected : ""
                          }`}
                        >
                          <div className={styles.unitTop}>
                            {canEdit ? (
                              <input
                                className={styles.checkbox}
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => togglePickingUnit(unit.id)}
                              />
                            ) : null}
                            <div className={styles.unitMain}>
                              <div className={styles.unitBarcode}>#{unit.barcode || unit.id}</div>
                              <div className={styles.unitMeta}>
                                Ячейка: {unit.cell?.code || "—"}
                                {cellDescription} • {formatDate(unit.created_at)}
                              </div>
                              {unit.scenario ? (
                                <span className={`${styles.chip} ${styles.chipScenario}`}>
                                  {unit.scenario}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                </div>
              </div>

              <div
                className={`${styles.listsWrapResizer} ${isListsResizing ? styles.listsWrapResizerDragging : ""}`}
                onMouseDown={handleListsResizeStart}
                role="separator"
                aria-label="Изменить высоту карточек"
              />

              <div className={styles.listsWrapDropped}>
                <div className={styles.listCard}>
                  <div className={styles.listHeader}>
                    <strong>Dropped ({filteredDroppedUnits.length})</strong>
                  <input
                    className={styles.input}
                    style={{ maxWidth: 220 }}
                    value={searchDropped}
                    onChange={(event) => setSearchDropped(event.target.value)}
                    placeholder="Поиск по barcode/courier/ops"
                  />
                </div>
                <div className={styles.actions} style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb" }}>
                  {availableDroppedColors.length === 0 ? (
                    <span className={styles.hint}>Нет цветных точек для фильтра</span>
                  ) : (
                    availableDroppedColors.map((color) => (
                      <label key={color} className={styles.legend}>
                        <input
                          type="checkbox"
                          checked={droppedColorFilter.has(color)}
                          onChange={() => toggleDroppedColorFilter(color)}
                          style={{ marginRight: 6 }}
                        />
                        {DROP_COLOR_LABEL[color]}
                      </label>
                    ))
                  )}
                </div>
                <div className={styles.listBody}>
                  {loading && !dashboard ? (
                    <div className={styles.empty}>Загрузка dropped...</div>
                  ) : filteredDroppedUnits.length === 0 ? (
                    <div className={styles.empty}>Нет данных о дропах</div>
                  ) : (
                    filteredDroppedUnits.map((unit) => {
                      const isSelected = selectedDroppedUnitIds.has(unit.unit_id);
                      return (
                        <div
                          key={`${unit.unit_id}-${unit.dropped_at}`}
                          className={`${styles.unitRow} ${isSelected ? styles.unitRowSelected : ""}`}
                        >
                          <div className={styles.unitTop}>
                            {canEdit ? (
                              <input
                                className={styles.checkbox}
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleDroppedUnit(unit.unit_id)}
                              />
                            ) : null}
                            <div className={styles.unitMain}>
                              <div className={styles.unitBarcode}>#{unit.unit_barcode || unit.unit_id}</div>
                              <div className={styles.unitMeta}>
                                Курьер: {unit.courier_name} • {formatDate(unit.dropped_at)}
                              </div>
                              <div className={styles.unitMeta}>
                                OPS: {unit.ops_status || "—"} • Статус: {unit.current_status || "—"}
                              </div>
                              <span
                                className={styles.chip}
                                style={{
                                  background: unit.color_hex,
                                  color: "#ffffff",
                                  width: "fit-content",
                                }}
                              >
                                Цвет: {DROP_COLOR_LABEL[unit.color_key]}
                              </span>
                              {unit.note ? <span className={styles.chip}>{unit.note}</span> : null}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`${styles.splitResizer} ${isResizing ? styles.splitResizerDragging : ""}`}
          onMouseDown={handleResizeStart}
          role="separator"
          aria-label="Изменить размер панелей"
        />

        <div className={`${styles.pane} ${styles.paneRight}`}>
          <div className={styles.paneInner}>
            <h2 className={styles.sectionTitle}>Карта маршрутов и дропов</h2>
            <RoutePlanningMap
              apiKey={mapsApiKey}
              zones={dashboard?.zones || []}
              dropPoints={filteredDropPoints}
              liveCouriers={dashboard?.live_couriers || []}
              showCouriers={showCouriersOnMap}
              colorFilter={droppedColorFilter}
              onColorFilterChange={toggleDroppedColorFilter}
              onShowCouriersChange={setShowCouriersOnMap}
              availableColors={DROP_COLOR_ORDER}
            />
            <div className={styles.hint}>
              Обновление данных: каждые 15 секунд. Показаны точки дропа и последние live-координаты
              открытых смен.
            </div>
          </div>
        </div>
      </div>
        </div>

        <div
          className={`${styles.mainCouriersResizer} ${isMainCouriersResizing ? styles.mainCouriersResizerDragging : ""}`}
          onMouseDown={handleMainCouriersResizeStart}
          role="separator"
          aria-label="Изменить высоту верхней и нижней области"
        />

        <div
          className={styles.couriersStripArea}
          style={{ height: mainHeights.couriersStripPx }}
        >
      <div className={styles.couriersStrip}>
        <div className={styles.couriersStripHeader}>
          <h3 className={styles.couriersStripTitle}>
            Курьеры сейчас в доставке ({dashboard?.live_couriers.length || 0})
          </h3>
          <div className={styles.couriersStripActions}>
            <span className={styles.couriersStripHint}>
              Цельная плашка: сводка по активным сменам и последнему live-пингу
            </span>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setCourierInsightsOpen(true)}
            >
              Все курьеры и архив
            </button>
          </div>
        </div>
        <div className={styles.couriersGrid}>
          {(dashboard?.live_couriers || []).length === 0 ? (
            <div className={styles.empty}>Сейчас нет активных курьеров в доставке.</div>
          ) : (
            (dashboard?.live_couriers || []).map((courier) => (
              <div key={courier.shift_id} className={styles.courierCard}>
                <div className={styles.courierName}>{courier.courier_name}</div>
                <div className={styles.courierMeta}>
                  Статус смены: {courier.status} • Задач: {courier.active_tasks}
                </div>
                <div className={styles.courierMeta}>
                  Старт: {formatDate(courier.started_at)}
                </div>
                <div className={styles.courierMeta}>
                  Последний live:{" "}
                  {courier.last_location?.recorded_at
                    ? formatDate(courier.last_location.recorded_at)
                    : "нет координат"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
        </div>
        </div>
      </div>

      <ZoneEditorModal
        open={zoneEditorOpen}
        apiKey={mapsApiKey}
        canEdit={canEdit}
        seedZones={dashboard?.zones || []}
        onClose={() => setZoneEditorOpen(false)}
        onUnauthorized={handleUnauthorized}
        onZonesUpdated={handleZonesUpdated}
      />
      <CourierInsightsModal
        open={courierInsightsOpen}
        onClose={() => setCourierInsightsOpen(false)}
        onUnauthorized={handleUnauthorized}
        apiKey={mapsApiKey}
      />

      {colorsInfoOpen && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setColorsInfoOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="colors-info-title"
        >
          <div
            className={styles.modal}
            style={{ maxWidth: 480 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 id="colors-info-title" className={styles.modalTitle}>
                Легенда цветов точек дропа
              </h2>
              <button
                type="button"
                onClick={() => setColorsInfoOpen(false)}
                aria-label="Закрыть"
                style={{
                  padding: 4,
                  border: "none",
                  background: "transparent",
                  fontSize: 20,
                  cursor: "pointer",
                  color: "#64748b",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                Важно: не все OPS-статусы создают точку дропа. Для статусов
                {" "}<strong>«Партнер не принял на возврат»</strong>,
                {" "}<strong>«Клиент не принял»</strong>,
                {" "}<strong>«Перенос»</strong> и <strong>«В работе»</strong>
                {" "}точка не создается, заказ остается у курьера.
              </p>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "#7c3aed",
                    flexShrink: 0,
                    marginTop: 4,
                  }}
                />
                <div>
                  <strong>Фиолетовый</strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                    Партнер принял на возврат. Заказ передан партнеру и уходит из рук курьера.
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "#facc15",
                    flexShrink: 0,
                    marginTop: 4,
                  }}
                />
                <div>
                  <strong>Жёлтый</strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                    Передан в СЦ. Заказ дропнут и передан в сервисный центр.
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "#6b7280",
                    flexShrink: 0,
                    marginTop: 4,
                  }}
                />
                <div>
                  <strong>Серый</strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                    Клиент принял. Финальная успешная выдача клиенту.
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "#111827",
                    flexShrink: 0,
                    marginTop: 4,
                  }}
                />
                <div>
                  <strong>Чёрный</strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                    Товар доставлен на ПУДО. Заказ дропнут в точке выдачи.
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "#ef4444",
                    flexShrink: 0,
                    marginTop: 4,
                  }}
                />
                <div>
                  <strong>Красный</strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                    Проблемные/исключительные дропы и старые данные, требующие внимания OPS.
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "#22c55e",
                    flexShrink: 0,
                    marginTop: 4,
                  }}
                />
                <div>
                  <strong>Зелёный</strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                    Ручная отметка OPS после разбора (переход с жёлтого).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
