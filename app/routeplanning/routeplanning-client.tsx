"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./routeplanning.module.css";

type CourierOption = {
  id: string;
  full_name: string;
};

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

type Zone = {
  id: string;
  name: string;
  code: string;
  priority: number;
  polygon: unknown[];
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
let googleMapsPromise: Promise<any> | null = null;

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

function RoutePlanningMap({ apiKey, zones, dropPoints, liveCouriers }: MapPanelProps) {
  const mapCanvasRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapObjectsRef = useRef<{ markers: any[]; polygons: any[] }>({
    markers: [],
    polygons: [],
  });
  const hasAutoFittedRef = useRef(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapsReady, setMapsReady] = useState(false);

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
    if (!mapsReady || !mapRef.current || !window.google?.maps) return;

    const maps = window.google.maps;
    const map = mapRef.current;
    clearMapObjects();

    const bounds = new maps.LatLngBounds();
    let hasBounds = false;
    const infoWindow = new maps.InfoWindow();

    for (const zone of zones) {
      const path = parsePolygon(zone.polygon);
      if (path.length < 3) continue;

      const polygon = new maps.Polygon({
        paths: path,
        strokeColor: "#2563eb",
        strokeOpacity: 0.75,
        strokeWeight: 2,
        fillColor: "#60a5fa",
        fillOpacity: 0.14,
      });
      polygon.setMap(map);
      mapObjectsRef.current.polygons.push(polygon);

      for (const point of path) {
        bounds.extend(point);
        hasBounds = true;
      }
    }

    for (const drop of dropPoints) {
      if (drop.lat === null || drop.lng === null) continue;
      const marker = new maps.Marker({
        map,
        position: { lat: drop.lat, lng: drop.lng },
        title: `Дроп ${drop.unit_barcode || drop.unit_id}`,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 5,
          fillColor: "#ef4444",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 1,
        },
      });
      mapObjectsRef.current.markers.push(marker);
      bounds.extend(marker.getPosition());
      hasBounds = true;
    }

    for (const courier of liveCouriers) {
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
  }, [mapsReady, zones, dropPoints, liveCouriers, clearMapObjects]);

  return (
    <div className={styles.mapCard}>
      <div className={styles.mapOverlay}>
        <span className={styles.legend}>Зоны</span>
        <span className={styles.legend}>Красный: дроп</span>
        <span className={styles.legend}>Синий: live курьер</span>
      </div>
      <div ref={mapCanvasRef} className={styles.mapCanvas} />
      {mapError && <div className={styles.mapNotice}>{mapError}</div>}
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
  const [manualCourierName, setManualCourierName] = useState("");
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [searchPicking, setSearchPicking] = useState("");
  const [searchDropped, setSearchDropped] = useState("");

  const canEdit = dashboard?.can_edit ?? initialCanEdit;
  const effectiveRole = dashboard?.role || initialRole;

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
    void loadDashboard(false);
    const intervalId = window.setInterval(() => {
      void loadDashboard(true);
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [loadDashboard]);

  useEffect(() => {
    if (!dashboard) return;
    const validUnitIds = new Set(dashboard.picking_units.map((unit) => unit.id));
    setSelectedUnitIds((prev) => {
      const next = new Set([...prev].filter((unitId) => validUnitIds.has(unitId)));
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [dashboard]);

  const selectedCourier = useMemo(
    () =>
      dashboard?.couriers.find((courier) => courier.id === selectedCourierUserId) || null,
    [dashboard?.couriers, selectedCourierUserId],
  );

  const effectiveCourierName = selectedCourier?.full_name || manualCourierName.trim();

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
    if (!q) return units;
    return units.filter((unit) => {
      const barcode = unit.unit_barcode.toLowerCase();
      const courierName = unit.courier_name.toLowerCase();
      const opsStatus = (unit.ops_status || "").toLowerCase();
      return barcode.includes(q) || courierName.includes(q) || opsStatus.includes(q);
    });
  }, [dashboard?.dropped_units, searchDropped]);

  const toggleUnit = useCallback((unitId: string) => {
    setSelectedUnitIds((prev) => {
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
    setSelectedUnitIds(new Set());
    setSelectedCourierUserId("");
    setManualCourierName("");
  }, []);

  const assignSelectedUnits = useCallback(async () => {
    if (!canEdit) return;
    if (selectedUnitIds.size === 0) {
      setError("Выберите хотя бы один заказ из picking");
      return;
    }
    if (!selectedCourierUserId && !manualCourierName.trim()) {
      setError("Выберите курьера или укажите имя вручную");
      return;
    }

    setAssigning(true);
    setError(null);
    setMessage(null);

    try {
      const unitIds = Array.from(selectedUnitIds);
      const response = await fetch("/api/routeplanning/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitIds,
          ...(selectedCourierUserId
            ? { courierUserId: selectedCourierUserId }
            : { courierName: manualCourierName.trim() }),
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
        const courierLabel = effectiveCourierName || "курьер";
        setMessage(`Отправлено ${successCount} заказ(ов) курьеру ${courierLabel}`);
        if (failedCount === 0) {
          clearSelection();
        } else {
          const failedIds = new Set((payload?.failed || []).map((item) => item.unit_id));
          setSelectedUnitIds(failedIds);
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
    clearSelection,
    effectiveCourierName,
    loadDashboard,
    manualCourierName,
    router,
    selectedCourierUserId,
    selectedUnitIds,
  ]);

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
            <h1 className={styles.title}>Route Planning</h1>
            <p className={styles.subtitle}>
              Split view: назначение из picking + live карта курьеров
            </p>
          </div>
        </div>

        <div className={styles.toolbarRight}>
          <span className={styles.badge}>Роль: {getRoleLabel(effectiveRole)}</span>
          <span
            className={`${styles.badge} ${
              canEdit ? styles.badgeEditable : styles.badgeReadonly
            }`}
          >
            {canEdit ? "Редактирование" : "Только просмотр"}
          </span>
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

      <div className={styles.split}>
        <div className={styles.pane}>
          <div className={styles.paneInner}>
            <h2 className={styles.sectionTitle}>Заказы и назначения</h2>

            <div className={styles.assignPanel}>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="routeplanning-courier">
                    Курьер из списка
                  </label>
                  <select
                    id="routeplanning-courier"
                    className={styles.select}
                    value={selectedCourierUserId}
                    onChange={(event) => setSelectedCourierUserId(event.target.value)}
                    disabled={!canEdit || assigning || loading}
                  >
                    <option value="">Выберите курьера</option>
                    {(dashboard?.couriers || []).map((courier) => (
                      <option key={courier.id} value={courier.id}>
                        {courier.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="routeplanning-manual-courier">
                    Или имя вручную
                  </label>
                  <input
                    id="routeplanning-manual-courier"
                    className={styles.input}
                    value={manualCourierName}
                    onChange={(event) => setManualCourierName(event.target.value)}
                    placeholder="Например: Али Мамедов"
                    disabled={!canEdit || assigning || loading}
                  />
                </div>
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void assignSelectedUnits()}
                  disabled={
                    !canEdit ||
                    assigning ||
                    selectedUnitIds.size === 0 ||
                    (!selectedCourierUserId && !manualCourierName.trim())
                  }
                >
                  {assigning ? "Отправка..." : `Передать выбранные (${selectedUnitIds.size})`}
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
                    ? "Редактирование доступно только для logistics и admin."
                    : "Режим чтения: без изменения назначений."}
                </span>
              </div>
            </div>

            <div className={styles.listsWrap}>
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
                      const isSelected = selectedUnitIds.has(unit.id);
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
                                onChange={() => toggleUnit(unit.id)}
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
                <div className={styles.listBody}>
                  {loading && !dashboard ? (
                    <div className={styles.empty}>Загрузка dropped...</div>
                  ) : filteredDroppedUnits.length === 0 ? (
                    <div className={styles.empty}>Нет данных о дропах</div>
                  ) : (
                    filteredDroppedUnits.map((unit) => (
                      <div key={`${unit.unit_id}-${unit.dropped_at}`} className={styles.unitRow}>
                        <div className={styles.unitBarcode}>#{unit.unit_barcode || unit.unit_id}</div>
                        <div className={styles.unitMeta}>
                          Курьер: {unit.courier_name} • {formatDate(unit.dropped_at)}
                        </div>
                        <div className={styles.unitMeta}>
                          OPS: {unit.ops_status || "—"} • Статус: {unit.current_status || "—"}
                        </div>
                        {unit.note ? <span className={styles.chip}>{unit.note}</span> : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.pane}>
          <div className={styles.paneInner}>
            <h2 className={styles.sectionTitle}>Карта маршрутов и дропов</h2>
            <RoutePlanningMap
              apiKey={mapsApiKey}
              zones={dashboard?.zones || []}
              dropPoints={dashboard?.drop_points || []}
              liveCouriers={dashboard?.live_couriers || []}
            />
            <div className={styles.hint}>
              Обновление данных: каждые 15 секунд. Показаны точки дропа и последние live-координаты
              открытых смен.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.couriersStrip}>
        <div className={styles.couriersStripHeader}>
          <h3 className={styles.couriersStripTitle}>
            Курьеры сейчас в доставке ({dashboard?.live_couriers.length || 0})
          </h3>
          <span className={styles.couriersStripHint}>
            Цельная плашка: сводка по активным сменам и последнему live-пингу
          </span>
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
  );
}
