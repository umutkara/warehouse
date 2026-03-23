"use client";

import { useState, useEffect, useMemo } from "react";
import { Alert, Button } from "@/lib/ui/components";
import * as XLSX from "xlsx";

type Cell = {
  id: string;
  code: string;
  cell_type: string;
  units_count?: number;
  meta?: any;
};

type Unit = {
  id: string;
  barcode: string;
  cell_id?: string;
  status?: string;
  ops_status?: string | null;
  created_at?: string;
};

type UnitWithCell = Unit & {
  age_hours?: number;
  cell?: {
    id: string;
    code: string;
    cell_type: string;
  } | null;
};

// OPS statuses (must match backend)
const OPS_STATUS_LABELS: Record<string, string> = {
  in_progress: "В работе",
  partner_accepted_return: "Партнер принял на возврат",
  partner_rejected_return: "Партнер не принял на возврат",
  sent_to_sc: "Передан в СЦ",
  delivered_to_rc: "Товар доставлен на РЦ",
  client_accepted: "Клиент принял",
  client_rejected: "Клиент не принял",
  sent_to_client: "Товар отправлен клиенту",
  delivered_to_pudo: "Товар доставлен на ПУДО",
  case_cancelled_cc: "Кейс отменен (Направлен КК)",
  postponed_1: "Перенос",
  postponed_2: "Перенос 2",
  warehouse_did_not_issue: "Склад не выдал",
  no_report: "Отчета нет",
};

type OpsStatusCode = keyof typeof OPS_STATUS_LABELS;

function getOpsStatusText(status: string | null | undefined): string {
  if (!status) return "Не назначен";
  return OPS_STATUS_LABELS[status as OpsStatusCode] || status;
}

function formatAge(hours: number): string {
  if (hours < 1) return "< 1ч";
  if (hours < 24) return `${hours}ч`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (remainingHours === 0) return `${days}д`;
  return `${days}д ${remainingHours}ч`;
}

function getAgeColor(hours: number): string {
  if (hours > 168) return "#dc2626"; // > 7 days - red
  if (hours > 48) return "#f59e0b";   // > 48h - orange
  if (hours > 24) return "#eab308";   // > 24h - yellow
  return "#10b981";                   // < 24h - green
}

function formatOrderNumberForExport(barcode?: string | null): string {
  if (!barcode) return "";
  if (!barcode.startsWith("00") || barcode.length < 4) return barcode;
  return barcode.slice(2, -2);
}

type Task = {
  id: string;
  status: string;
  scenario?: string;
  created_at: string;
  created_by_name?: string;
  picked_at?: string;
  completed_at?: string;
  unitCount: number;
  units: Array<{
    id: string;
    barcode: string;
    cell_id?: string;
    status?: string;
  }>;
  fromCells?: Array<{
    code: string;
    cell_type: string;
  }>;
  targetCell?: {
    id: string;
    code: string;
    cell_type: string;
  } | null;
};

type UnitDetails = {
  id: string;
  barcode: string;
  status: string;
  cell_id?: string;
  created_at: string;
  cell?: {
    id: string;
    code: string;
    cell_type: string;
  } | null;
  item?: {
    title?: string;
    sku?: string;
    vendor?: string;
    image_url?: string;
  } | null;
};

// Scenario configuration
const SCENARIO_FROM = "Склад Возвратов";

// Список пудо точек (можно расширять)
// Для добавления новых точек просто добавьте строку в массив ниже
const PUDO_POINTS = [
  "Birmarket_Masazır_66, Bakı, Bakı şəh.Abşeron r-on.Masazır \"Yeni Baki\" yaşayış kompleksi",
  "Birmarket_Yasamal_Mərkəzi_Park_282, Bakı, Bakı şəh.Yasamal.Nəriman Nərimanov pr ,57/24",
  "Birmarket_Xırdalan_Kristal_257, Bakı, Baku şəh.Xırdalan.H.Əliyev pr ,11",
  "Birmarket_Qaraçuxur_277, Bakı, Bakı şəh.Suraxanı r-on.Rafiq Alıcanov.4057-4060 mikroray",
  "Birmarket_Azadliq_pr._Inqlab_204, Bakı, Bakı şəh.Nərimanov.Möhsün Sənani küç ,153",
  "Birmarket_Lökbatan_208, Bakı, Bakı şəh.Qaradağ.Lökbatan qəsəbəsi, 28 May küç,18Ф",
  "Birmarket_Xətai_Ganja_ave_56, Bakı, Baki şəh.Xətai r-on.Gəncə pr 34 A.",
  "Birmarket_Nəsrəddin_Tusi_276, Bakı, Bakı şəh.Xətai.Nəsrəddin Tusi küç, 55",
  "Birmarket_6cı_Paralel_6, Bakı, Bakı şəh.Yasamal r-on.Məhəmməd Naxçivani küç",
  "Birmarket_Xalqlar_207, Bakı, Bakı şəh.Nizami r-on.Bəhruz Nuriyev küç, 29",
  "Birmarket_Nizami_26, Bakı, Bakı şəh.Nizami r-on.Elşən Suleymanov küç. 124",
  "Birmarket_Yasamal_ATV_258, Bakı, Bakı şəh.Yasamal.A.M.Şərifzadə küç,12",
  "Birmarket_Nizami_29, Bakı, Məmmədəli Şərifli küçəsi 239B",
  "Birmarket_Armoni_Residence_310, Bakı, Bakı şəh, Tələt Şıxəliyev küç, ev ,3",
  "003 Birmarket Bravo Khatai', Bakı, Bakı şəh.Xətai r-on.Sabit Orucov küç 13,1",
  "Birmarket_Binəqədi_261, Bakı, Bakı şəh.Binəqədi . M.Ə. Rəsulzadə qəsəbəsi, Binəqədi şossesi, ,287Д",
  "Birmarket_Yasamal_Əsəd_Əhmədov_259, Bakı, Bakı şəh.Yasamal.Yeni Yasamal yaşyış massivi, Xarici Dairəvi Yolu, 20",
  "Birmarket_Nəsimi_70, Bakı, Bakı şəh.Nəsimi r-on.Cəlil Məmmədquluzadə küç, 118",
  "Birmarket_Baki_4mkr_186, Bakı, Bakı şəh.Nəsimi r-on.Hüseyn Seyidzadə,27А",
  "Birmarket_Seyid_Əzim_Şirvani_260, Bakı, Bakı şəh.Xətai .Seyid Əzim Şirvani küç ,47А",
  "Birmarket_Aygun_Mall_73, Bakı, Bakı şəh.Sabunçu r-on.Bakixanov qəsəbəsi, Gənclik küç ,39",
  "Birmarket_Xırdalan_307, Bakı, Bakı şəh.Abşeron r-on. Xirdalan, 27ci dalan ,21",
  "Birmarket_Yeni_Yasamal_67, Bakı, Bakı şəh.Yasamal r-on.Məhəmməd Xiyabani küç,33",
  "Birmarket_Əmircan_309, Bakı, Bakı şəh.Suraxanı r-on, Bülbülə qəs. S.Bəhlulzadə küç. ,95B",
  "Birmarket_Xirdalan_1_191, Bakı, Baku şəh.Abşeron.28-ci məhəllə ,7В",
  "002 Birmarket BRAVO 20 Января', Bakı, Bakı şəh.Nəsimi r-on..Tbilisi pr,3007",
  "Birmarket_Nərimanov_5, Bakı, Bakı şəh.Nərimanov r-on.Əhməd Rəcəbli küç, 4/6",
  "Birmarket_Baku_Bakixanov_Akkord_166, Bakı, Bakı şəh.Sabunçu r-on.Sabunçu qəs, Yavər Əliyev küç ,49а",
  "Birmarket_Bakixanov24_185, Bakı, Bakı şəh.Nəsimi r-on.Bakıxanov küç ,24",
  "Birmarket_Xetai_Metro_171, Bakı, Bakı şəh.Xətai r-on.Xocalı pr ,29",
  "Birmarket_Baku_Uzeyir_Hacibeyov_str._169, Bakı, Bakı şəh.Səbail r-on.Üzeyir Hacıbəyov küç ,34/43",
  "001 Birmarket BRAVO Ахмадли', Bakı, Bakı şəh.Xətai r-on.Ramiz Quliyev küç ,4",
  "Birmarket_Badamdar_69, Bakı, Bakı şəh.Səbail r-on.Badamdar şossesi 77",
  "412 Birmarket Bravo Chocolate tower_7, Bakı, Bakı şəh.Yasamal r-on.574-cü məhəllə Həsən Bəy Zərdabi pr",
  "Другое",
];

// Категории с выпадающим списком (только Pudo)
const SCENARIO_TO_OPTIONS = {
  Pudo: PUDO_POINTS,
} as const;

// Категории с ручным вводом
type ManualInputCategory = "Мерчант" | "Сервис" | "Азерпочта" | "Клиент";
type DropdownCategory = keyof typeof SCENARIO_TO_OPTIONS;
type ScenarioCategory = ManualInputCategory | DropdownCategory | "";

type OpsShippingMode = "shipping" | "service" | null;

function ModeSelectorSlider({
  value,
  onChange,
  compact,
}: {
  value: OpsShippingMode;
  onChange: (m: "shipping" | "service") => void;
  compact?: boolean;
}) {
  const options = [
    { id: "shipping" as const, label: "Создание заданий на отгрузку", icon: "📦" },
    { id: "service" as const, label: "Создание заданий от сервиса", icon: "🔄" },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: compact ? 3 : 6,
        background: "linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)",
        borderRadius: 12,
        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.06)",
      }}
    >
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{
              flex: 1,
              padding: compact ? "8px 14px" : "14px 20px",
              border: "none",
              borderRadius: 10,
              background: selected ? "#fff" : "transparent",
              boxShadow: selected ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: compact ? 13 : 14,
              transition: "all 0.2s ease",
              color: selected ? "#111" : "#4b5563",
            }}
          >
            {opt.icon} {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function OpsShippingPage() {
  const [mode, setMode] = useState<OpsShippingMode>(null);
  const [availableUnits, setAvailableUnits] = useState<UnitWithCell[]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [pickingCells, setPickingCells] = useState<Cell[]>([]);
  const [selectedPickingCellId, setSelectedPickingCellId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [opsStatusFilter, setOpsStatusFilter] = useState<string>("");
  const [includeRejected, setIncludeRejected] = useState(false);
  const [sortAgeOrder, setSortAgeOrder] = useState<"desc" | "asc" | "">("");
  
  // Scenario state
  const [scenarioCategory, setScenarioCategory] = useState<ScenarioCategory | "">("");
  const [scenarioDestination, setScenarioDestination] = useState<string>("");
  
  const [loading, setLoading] = useState(false);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [bulkCanceling, setBulkCanceling] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [taskFilterStatus, setTaskFilterStatus] = useState<string>("");
  const [taskFilterFromCell, setTaskFilterFromCell] = useState<string>("");
  const [taskFilterTargetCell, setTaskFilterTargetCell] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastCreatedCount, setLastCreatedCount] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ created: number; total: number } | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importTasksCountAfter, setImportTasksCountAfter] = useState<number | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingScenarioValue, setEditingScenarioValue] = useState<string>("");
  const [savingScenario, setSavingScenario] = useState(false);
  
  // Modal state
  const [modalUnitId, setModalUnitId] = useState<string | null>(null);
  const [modalUnitDetails, setModalUnitDetails] = useState<UnitDetails | null>(null);
  const [loadingModal, setLoadingModal] = useState(false);

  // Service mode: yellow dropped units
  const [yellowUnits, setYellowUnits] = useState<Array<{
    unit_id: string;
    unit_barcode: string;
    current_status: string;
    dropped_at: string;
    courier_name: string;
    ops_status: string | null;
    scenario: string | null;
    color_key: string;
    color_hex: string;
  }>>([]);
  const [loadingYellowUnits, setLoadingYellowUnits] = useState(false);
  const [selectedServiceUnitIds, setSelectedServiceUnitIds] = useState<Set<string>>(new Set());
  const [serviceTargetColor, setServiceTargetColor] = useState<"blue" | "green">("blue");
  const [serviceScenario, setServiceScenario] = useState("");
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [serviceSuccess, setServiceSuccess] = useState<string | null>(null);
  const [assigningColor, setAssigningColor] = useState(false);

  // Compute final scenario string
  const scenarioString = scenarioCategory && scenarioDestination
    ? `${SCENARIO_FROM} → ${scenarioCategory} → ${scenarioDestination}`
    : "";

  // Фильтрация задач по статусу, ячейке FROM и TO
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (taskFilterStatus && task.status !== taskFilterStatus) return false;
      if (taskFilterFromCell) {
        const fromCodes = (task.fromCells || []).map((c) => c.code);
        if (!fromCodes.includes(taskFilterFromCell)) return false;
      }
      if (taskFilterTargetCell) {
        if (task.targetCell?.code !== taskFilterTargetCell) return false;
      }
      return true;
    });
  }, [tasks, taskFilterStatus, taskFilterFromCell, taskFilterTargetCell]);

  // Только отменяемые задачи (open/in_progress) среди отфильтрованных
  const cancelableFilteredTasks = useMemo(
    () => filteredTasks.filter((t) => t.status === "open" || t.status === "in_progress"),
    [filteredTasks]
  );

  // Уникальные коды ячеек FROM и TO для фильтров
  const taskFilterFromCellOptions = useMemo(() => {
    const codes = new Set<string>();
    tasks.forEach((t) => (t.fromCells || []).forEach((c) => codes.add(c.code)));
    return Array.from(codes).sort();
  }, [tasks]);
  const taskFilterTargetCellOptions = useMemo(() => {
    const codes = new Set<string>();
    tasks.forEach((t) => {
      if (t.targetCell?.code) codes.add(t.targetCell.code);
    });
    return Array.from(codes).sort();
  }, [tasks]);

  // Load picking cells, available units and tasks only when shipping mode is selected.
  // AbortController prevents duplicate API calls when effect runs twice (e.g. React Strict Mode).
  useEffect(() => {
    if (mode !== "shipping") return;

    const controller = new AbortController();
    const signal = controller.signal;

    async function loadPickingCells() {
      try {
        const res = await fetch("/api/cells/list", { cache: "no-store", signal });
        const json = await res.json();
        if (signal.aborted) return;
        if (res.ok) {
          const picking = (json.cells || []).filter((c: Cell) => c.cell_type === "picking");
          setPickingCells(picking);
          if (picking.length === 0) {
            setError("Нет picking ячеек. Добавьте на карте склада ячейки с cell_type='picking'");
          }
        }
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        console.error("Failed to load picking cells:", e);
        setError("Ошибка загрузки ячеек");
      }
    }
    loadPickingCells();
    loadAvailableUnits(signal);
    loadTasks(signal);

    return () => controller.abort();
  }, [mode]);

  // Load yellow dropped units when service mode is selected.
  useEffect(() => {
    if (mode !== "service") return;
    const controller = new AbortController();
    const signal = controller.signal;
    setLoadingYellowUnits(true);
    setServiceError(null);
    fetch("/api/ops/service-tasks/yellow-units", { cache: "no-store", signal })
      .then((res) => res.json())
      .then((json) => {
        if (signal.aborted) return;
        if (json.ok) setYellowUnits(json.units || []);
        else setServiceError(json.error || "Ошибка загрузки");
      })
      .catch((e) => {
        if (e?.name !== "AbortError") {
          setServiceError("Ошибка загрузки жёлтых заказов");
          setYellowUnits([]);
        }
      })
      .finally(() => {
        if (!signal.aborted) setLoadingYellowUnits(false);
      });
    return () => controller.abort();
  }, [mode]);

  async function loadYellowUnits() {
    setLoadingYellowUnits(true);
    setServiceError(null);
    try {
      const res = await fetch("/api/ops/service-tasks/yellow-units", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setYellowUnits(json.units || []);
      else setServiceError(json.error || "Ошибка загрузки");
    } catch {
      setServiceError("Ошибка загрузки жёлтых заказов");
      setYellowUnits([]);
    } finally {
      setLoadingYellowUnits(false);
    }
  }

  function handleToggleServiceUnit(unitId: string) {
    setSelectedServiceUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

  function handleSelectAllServiceUnits() {
    const ids = new Set(yellowUnits.map((u) => u.unit_id));
    const allSelected = ids.size > 0 && [...ids].every((id) => selectedServiceUnitIds.has(id));
    if (allSelected) {
      setSelectedServiceUnitIds((prev) => new Set([...prev].filter((id) => !ids.has(id))));
    } else {
      setSelectedServiceUnitIds((prev) => new Set([...prev, ...ids]));
    }
  }

  async function handleServiceAssign() {
    const ids = [...selectedServiceUnitIds];
    if (ids.length === 0) return;
    setAssigningColor(true);
    setServiceError(null);
    setServiceSuccess(null);
    let okCount = 0;
    const errs: string[] = [];
    for (const unitId of ids) {
      try {
        const res = await fetch("/api/ops/courier-returns/color", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unitId,
            colorKey: serviceTargetColor,
            scenario: serviceScenario.trim() || undefined,
          }),
        });
        const json = await res.json();
        if (res.ok && json.ok) okCount++;
        else errs.push(json.error || "Ошибка");
      } catch {
        errs.push("Сетевая ошибка");
      }
    }
    setAssigningColor(false);
    if (okCount > 0) {
      setServiceSuccess(`Обновлено: ${okCount} из ${ids.length} заказов`);
      setSelectedServiceUnitIds(new Set());
      setServiceScenario("");
      loadYellowUnits();
    }
    if (errs.length > 0) setServiceError(errs.slice(0, 3).join("; "));
  }

  // Load available units from storage/shipping. Optional signal for mount-only load (avoids duplicate calls).
  // Optional cacheBust: when true, appends ?_t= to force fresh response after create/import.
  // Optional silent: when true, does not set loadingUnits (no loading flash after cancel).
  async function loadAvailableUnits(abortSignal?: AbortSignal, cacheBust?: boolean, silent?: boolean) {
    if (!silent) setLoadingUnits(true);
    if (!silent) setError(null);
    const url = cacheBust ? `/api/units/storage-shipping?_t=${Date.now()}` : "/api/units/storage-shipping";
    try {
      const res = await fetch(url, { cache: "no-store", signal: abortSignal });
      if (abortSignal?.aborted) return;

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Non-JSON response from /api/units/storage-shipping:", text);
        setAvailableUnits([]);
        return;
      }

      const json = await res.json();
      if (abortSignal?.aborted) return;

      if (res.ok) {
        setAvailableUnits(json.units || []);
      } else {
        console.error("Error loading units:", json.error || "Unknown error");
        setError(json.error || "Ошибка загрузки заказов");
        setAvailableUnits([]);
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      console.error("Failed to load units:", e);
      if (!silent) setError("Ошибка загрузки заказов");
      setAvailableUnits([]);
    } finally {
      if (!silent && !abortSignal?.aborted) setLoadingUnits(false);
    }
  }

  // Load tasks. Optional signal for mount-only load (avoids duplicate calls).
  // Optional cacheBust: when true, appends ?_t= to force fresh response after create/import.
  // Optional silent: when true, does not set loadingTasks (no "Загрузка..." flash after cancel).
  // Returns the number of tasks loaded (for showing "В списке теперь N задач" after import).
  async function loadTasks(abortSignal?: AbortSignal, cacheBust?: boolean, silent?: boolean): Promise<number> {
    if (!silent) setLoadingTasks(true);
    const base = "/api/tsd/shipping-tasks/list";
    const params = new URLSearchParams();
    if (cacheBust) params.set("_t", String(Date.now()));
    const url = params.toString() ? `${base}?${params.toString()}` : base;
    try {
      const res = await fetch(url, { cache: "no-store", signal: abortSignal });
      if (abortSignal?.aborted) return 0;

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Non-JSON response from /api/tsd/shipping-tasks/list:", text);
        setTasks([]);
        return 0;
      }

      const json = await res.json();
      if (abortSignal?.aborted) return 0;

      if (res.ok) {
        const taskList = json.tasks || [];
        setTasks(taskList);
        return taskList.length;
      } else {
        console.error("Error loading tasks:", json.error || "Unknown error");
        setTasks([]);
        return 0;
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return 0;
      console.error("Failed to load tasks:", e);
      setTasks([]);
      return 0;
    } finally {
      if (!silent && !abortSignal?.aborted) setLoadingTasks(false);
    }
  }

  function handleToggleTaskSelection(taskId: string) {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function handleSelectAllTasks() {
    const cancelableIds = new Set(cancelableFilteredTasks.map((t) => t.id));
    const allCancelableSelected = cancelableIds.size > 0 && [...cancelableIds].every((id) => selectedTaskIds.has(id));
    if (allCancelableSelected) {
      // Снять выбор с всех отображаемых отменяемых задач (остальные оставить)
      setSelectedTaskIds((prev) => new Set([...prev].filter((id) => !cancelableIds.has(id))));
    } else {
      // Выбрать все отображаемые отменяемые задачи
      setSelectedTaskIds((prev) => new Set([...prev, ...cancelableIds]));
    }
  }

  async function handleBulkCancelSelected() {
    const toCancel = [...selectedTaskIds].filter((id) => {
      const task = tasks.find((t) => t.id === id);
      return task && (task.status === "open" || task.status === "in_progress");
    });
    if (toCancel.length === 0) return;
    if (!confirm(`Отменить выбранные задачи (${toCancel.length})? Заказы вернутся в исходные ячейки.`)) return;
    setBulkCanceling(true);
    setError(null);
    setSuccess(null);
    let done = 0;
    const failed: string[] = [];
    for (const taskId of toCancel) {
      try {
        const res = await fetch(`/api/picking-tasks/${taskId}/cancel`, { method: "POST" });
        const json = await res.json();
        if (res.ok) {
          setTasks((prev) => prev.filter((t) => t.id !== taskId));
          setSelectedTaskIds((prev) => {
            const next = new Set(prev);
            next.delete(taskId);
            return next;
          });
          done++;
        } else failed.push(taskId);
      } catch {
        failed.push(taskId);
      }
    }
    setBulkCanceling(false);
    if (done > 0) setSuccess(`Отменено задач: ${done}.${failed.length > 0 ? ` Ошибки: ${failed.length}.` : ""}`);
    if (failed.length > 0) setError(`Не удалось отменить: ${failed.length} задач.`);
    if (done > 0) {
      loadTasks(undefined, true, true).then(() => {});
      loadAvailableUnits(undefined, true, true).catch(() => {});
    }
  }

  async function handleBulkCancelFiltered() {
    if (cancelableFilteredTasks.length === 0) return;
    if (!confirm(`Отменить все отображаемые задачи (${cancelableFilteredTasks.length})? Заказы вернутся в исходные ячейки.`)) return;
    setBulkCanceling(true);
    setError(null);
    setSuccess(null);
    const toCancel = cancelableFilteredTasks.map((t) => t.id);
    let done = 0;
    const failed: string[] = [];
    for (const taskId of toCancel) {
      try {
        const res = await fetch(`/api/picking-tasks/${taskId}/cancel`, { method: "POST" });
        const json = await res.json();
        if (res.ok) {
          setTasks((prev) => prev.filter((t) => t.id !== taskId));
          setSelectedTaskIds((prev) => {
            const next = new Set(prev);
            next.delete(taskId);
            return next;
          });
          done++;
        } else failed.push(taskId);
      } catch {
        failed.push(taskId);
      }
    }
    setBulkCanceling(false);
    if (done > 0) setSuccess(`Отменено задач: ${done}.${failed.length > 0 ? ` Ошибки: ${failed.length}.` : ""}`);
    if (failed.length > 0) setError(`Не удалось отменить: ${failed.length} задач.`);
    if (done > 0) {
      loadTasks(undefined, true, true).then(() => {});
      loadAvailableUnits(undefined, true, true).catch(() => {});
    }
  }

  function openEditScenario(task: Task) {
    setEditingTask(task);
    setEditingScenarioValue(task.scenario || "");
  }

  function closeEditScenario() {
    if (savingScenario) return;
    setEditingTask(null);
    setEditingScenarioValue("");
  }

  async function handleSaveScenario() {
    if (!editingTask) return;
    setSavingScenario(true);
    setError(null);
    setSuccess(null);
    try {
      const normalized = editingScenarioValue.trim();
      const res = await fetch(`/api/ops/picking-tasks/${editingTask.id}/scenario`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: normalized || null }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Не удалось обновить сценарий");
      }
      setTasks((prev) =>
        prev.map((t) =>
          t.id === editingTask.id ? { ...t, scenario: json.task?.scenario || null } : t
        )
      );
      setSuccess("Сценарий задачи обновлен");
      closeEditScenario();
    } catch (e: any) {
      setError(e.message || "Ошибка обновления сценария");
    } finally {
      setSavingScenario(false);
    }
  }

  // Toggle unit selection
  function handleToggleUnit(unitId: string) {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  }

  // Filter units by OPS статус и поиску
  const filteredAvailableUnits = availableUnits.filter((unit) => {
    // Rejected cell filter (optional)
    if (!includeRejected && unit.cell?.cell_type === "rejected") {
      return false;
    }

    // OPS status filter
    if (opsStatusFilter === "no_status") {
      if (unit.ops_status) return false;
    } else if (opsStatusFilter) {
      if (unit.ops_status !== opsStatusFilter) return false;
    }

    // Text search
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    return (
      unit.barcode?.toLowerCase().includes(query) ||
      unit.cell?.code?.toLowerCase().includes(query) ||
      unit.status?.toLowerCase().includes(query) ||
      unit.cell?.cell_type?.toLowerCase().includes(query)
    );
  });

  // Sort by time on warehouse (age_hours)
  const sortedAvailableUnits =
    sortAgeOrder === "desc"
      ? [...filteredAvailableUnits].sort((a, b) => (b.age_hours ?? 0) - (a.age_hours ?? 0))
      : sortAgeOrder === "asc"
        ? [...filteredAvailableUnits].sort((a, b) => (a.age_hours ?? 0) - (b.age_hours ?? 0))
        : filteredAvailableUnits;

  // Select all units (based on sorted list)
  function handleSelectAll() {
    if (selectedUnitIds.size === sortedAvailableUnits.length && sortedAvailableUnits.length > 0) {
      // Deselect all
      const filteredIds = new Set(sortedAvailableUnits.map((u) => u.id));
      setSelectedUnitIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      // Select all
      const filteredIds = new Set(sortedAvailableUnits.map((u) => u.id));
      setSelectedUnitIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  // Open unit details modal
  async function handleOpenUnitDetails(unitId: string) {
    setModalUnitId(unitId);
    setLoadingModal(true);
    setModalUnitDetails(null);

    try {
      // Load unit details
      const unitRes = await fetch(`/api/units/get?unitId=${unitId}`, { cache: "no-store" });
      const unitJson = await unitRes.json();

      if (!unitRes.ok || !unitJson.unit) {
        throw new Error("Не удалось загрузить данные заказа");
      }

      const unit = unitJson.unit;

      // Load cell if exists
      let cell = null;
      if (unit.cell_id) {
        const cellRes = await fetch(`/api/cells/get?cellId=${unit.cell_id}`, { cache: "no-store" });
        const cellJson = await cellRes.json();
        if (cellRes.ok && cellJson.cell) {
          cell = cellJson.cell;
        }
      }

      // Load unit_item if exists
      let item = null;
      const itemRes = await fetch(`/api/unit-items/get?unitId=${unitId}`, { cache: "no-store" });
      const itemJson = await itemRes.json();
      if (itemRes.ok && itemJson.item) {
        item = itemJson.item;
      }

      setModalUnitDetails({
        ...unit,
        cell,
        item,
      });
    } catch (e: any) {
      console.error("Failed to load unit details:", e);
      setModalUnitDetails(null);
    } finally {
      setLoadingModal(false);
    }
  }

  // Close modal
  function handleCloseModal() {
    setModalUnitId(null);
    setModalUnitDetails(null);
  }

  // Export available units to XLSX (Excel)
  async function handleExportToXLSX() {
    if (availableUnits.length === 0) {
      setError("Нет заказов для экспорта");
      return;
    }

    try {
      // Prepare data
      const rows = availableUnits.map((unit) => {
        const createdAt = unit.created_at ? new Date(unit.created_at).toLocaleString("ru-RU") : "";
        const ageStr = typeof unit.age_hours === "number" ? formatAge(unit.age_hours) : "";
        return {
          "Штрихкод": formatOrderNumberForExport(unit.barcode),
          "На складе": ageStr,
          "Статус": unit.status || "",
          "Ячейка": unit.cell?.code || "",
          "Тип ячейки": unit.cell?.cell_type || "",
          "Создан": createdAt,
        };
      });

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);

      // Set column widths
      ws["!cols"] = [
        { wch: 20 }, // Штрихкод
        { wch: 12 }, // На складе
        { wch: 15 }, // Статус
        { wch: 15 }, // Ячейка
        { wch: 15 }, // Тип ячейки
        { wch: 20 }, // Создан
      ];

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Доступные заказы");

      // Generate file and download
      const fileName = `units_storage_shipping_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      setSuccess(`Экспортировано ${availableUnits.length} заказов в XLSX`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      console.error("Export to XLSX error:", e);
      setError("Ошибка экспорта в XLSX");
    }
  }

  // Export available units to CSV
  async function handleExportToCSV() {
    if (availableUnits.length === 0) {
      setError("Нет заказов для экспорта");
      return;
    }

    try {
      // Generate CSV headers
      const headers = [
        "Штрихкод",
        "На складе",
        "Статус",
        "Ячейка",
        "Тип ячейки",
        "Создан",
      ];

      // Generate CSV rows
      const rows = availableUnits.map((unit) => {
        const createdAt = unit.created_at ? new Date(unit.created_at).toLocaleString("ru-RU") : "";
        const ageStr = typeof unit.age_hours === "number" ? formatAge(unit.age_hours) : "";
        return [
          formatOrderNumberForExport(unit.barcode),
          ageStr,
          unit.status || "",
          unit.cell?.code || "",
          unit.cell?.cell_type || "",
          createdAt,
        ];
      });

      // Generate CSV content
      const csvContent = [
        headers.join(","),
        ...rows.map((row) => 
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
        ),
      ].join("\n");

      // Add BOM for UTF-8 Excel compatibility
      const bom = "\uFEFF";
      const csvWithBom = bom + csvContent;

      // Create blob and download
      const blob = new Blob([csvWithBom], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `units_storage_shipping_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setSuccess(`Экспортировано ${availableUnits.length} заказов в CSV`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      console.error("Export to CSV error:", e);
      setError("Ошибка экспорта в CSV");
    }
  }

  function normalizeHeader(value: string) {
    return value.trim().toLowerCase();
  }

  function getRowValue(row: Record<string, any>, keys: string[]) {
    for (const key of keys) {
      const normalizedKey = normalizeHeader(key);
      const actualKey = Object.keys(row).find((k) => normalizeHeader(k) === normalizedKey);
      if (actualKey) {
        const value = row[actualKey];
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          return String(value).trim();
        }
      }
    }
    return "";
  }

  async function handleImportExcel(file: File | null) {
    if (!file) return;

    setImporting(true);
    setImportErrors([]);
    setImportSuccess(null);
    setImportTasksCountAfter(null);
    setError(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        setImportErrors(["Файл Excel не содержит листов"]);
        return;
      }

      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      const rawArrayRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });

      if (rawRows.length === 0 && rawArrayRows.length === 0) {
        setImportErrors(["Файл Excel пустой или не содержит данных"]);
        return;
      }

      const headerRow = Array.isArray(rawArrayRows[0]) ? rawArrayRows[0] : [];
      const headerText = headerRow.map((cell) => String(cell || "").trim().toLowerCase());
      const headerNames = new Set([
        "заказ",
        "штрихкод",
        "barcode",
        "order",
        "мерчант",
        "куда",
        "сценарий",
        "scenario",
        "код ячейки picking",
        "пикинг",
        "пиккинг",
        "picking",
        "picking cell",
        "ячейка picking",
      ]);
      const headerScore = headerText.filter((cell) => headerNames.has(cell)).length;
      const firstCell = String(headerRow?.[0] ?? "").trim();
      const firstCellIsOrder = /^\d+$/.test(firstCell);
      const hasHeaders = !firstCellIsOrder && headerScore >= 2;

      const dataRows = hasHeaders ? rawArrayRows.slice(1) : rawArrayRows;
      const rows = (hasHeaders ? rawRows : dataRows).map((row: any, index: number) => {
        if (hasHeaders) {
          const order = getRowValue(row, ["заказ", "штрихкод", "barcode", "order"]);
          const destination = getRowValue(row, ["мерчант", "куда"]);
          const scenario = getRowValue(row, ["сценарий", "scenario"]);
          const pickingCode = getRowValue(row, ["код ячейки picking", "picking", "picking cell", "ячейка picking"]);

          return {
            rowIndex: index + 2,
            order,
            destination,
            scenario,
            picking_code: pickingCode,
          };
        }

        const order = String(row?.[0] ?? "").trim();
        const destination = String(row?.[1] ?? "").trim();
        const scenario = String(row?.[2] ?? "").trim();
        const pickingCode = String(row?.[3] ?? "").trim();

        return {
          rowIndex: index + 1,
          order,
          destination,
          scenario,
          picking_code: pickingCode,
        };
      }).filter((row: any) => row.order || row.destination || row.scenario || row.picking_code);
      const res = await fetch("/api/ops/picking-tasks/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("ndjson")) {
        // Streaming: read progress and done from NDJSON stream
        const reader = res.body?.getReader();
        if (!reader) {
          setImportErrors(["Ошибка чтения ответа"]);
          return;
        }
        const decoder = new TextDecoder();
        let buffer = "";
        let gotDone = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const obj = JSON.parse(line);
              if (obj.type === "progress") {
                setImportProgress({ created: obj.created, total: obj.total });
                if (obj.created % 50 === 0) loadTasks(undefined, true);
              } else if (obj.type === "done") {
                gotDone = true;
                setImportProgress(null);
                if (obj.ok !== false && Array.isArray(obj.errors) && obj.errors.length > 0) {
                  setImportErrors(obj.errors.map((e: any) => `Строка ${e.rowIndex}: ${e.message}`));
                }
                if (obj.ok === false) {
                  setImportErrors([obj.errors?.[0]?.message || "Ошибка импорта"]);
                }
                const createdCount = obj.created ?? 0;
                const availCount = obj.availableUnitsCount ?? null;
                setImportSuccess(
                  availCount !== null
                    ? `Создано заданий: ${createdCount}. Доступных для матчинга: ${availCount}. Обновляю списки…`
                    : `Создано заданий: ${createdCount}. Обновляю списки…`
                );
                const [tasksCount] = await Promise.all([loadTasks(undefined, true), loadAvailableUnits(undefined, true)]);
                setImportTasksCountAfter(tasksCount);
                setImportSuccess(
                  availCount !== null
                    ? `Создано заданий: ${createdCount}. Доступных для матчинга: ${availCount}. В списке теперь ${tasksCount} задач.`
                    : `Создано заданий: ${createdCount}. В списке теперь ${tasksCount} задач.`
                );
              }
            } catch (parseErr) {
              // ignore malformed NDJSON line
            }
          }
        }
        if (buffer.trim()) {
          try {
            const obj = JSON.parse(buffer);
            if (obj.type === "done") {
              gotDone = true;
              setImportProgress(null);
              if (obj.ok !== false && Array.isArray(obj.errors) && obj.errors.length > 0) {
                setImportErrors(obj.errors.map((e: any) => `Строка ${e.rowIndex}: ${e.message}`));
              }
              const createdCount = obj.created ?? 0;
              const availCount = obj.availableUnitsCount ?? null;
              setImportSuccess(`Создано заданий: ${createdCount}. Обновляю списки…`);
              const [tasksCount] = await Promise.all([loadTasks(undefined, true), loadAvailableUnits(undefined, true)]);
              setImportTasksCountAfter(tasksCount);
              setImportSuccess(
                availCount !== null
                  ? `Создано заданий: ${createdCount}. Доступных для матчинга: ${availCount}. В списке теперь ${tasksCount} задач.`
                  : `Создано заданий: ${createdCount}. В списке теперь ${tasksCount} задач.`
              );
            }
          } catch (parseErr) {
            // ignore malformed NDJSON buffer
          }
        }
        if (!gotDone) {
          setImportSuccess("Импорт завершён. Обновляю списки…");
          const [tasksCount] = await Promise.all([loadTasks(undefined, true), loadAvailableUnits(undefined, true)]);
          setImportTasksCountAfter(tasksCount);
          setImportSuccess(`В списке теперь ${tasksCount} задач.`);
        }
      } else {
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setImportErrors([json.error || "Ошибка импорта"]);
          return;
        }
        if (Array.isArray(json.errors) && json.errors.length > 0) {
          setImportErrors(json.errors.map((e: any) => `Строка ${e.rowIndex}: ${e.message}`));
        }
        const createdCount = json.created ?? 0;
        const availCount = json.availableUnitsCount ?? null;
        setImportSuccess(`Создано заданий: ${createdCount}. Обновляю списки…`);
        const [tasksCount] = await Promise.all([loadTasks(undefined, true), loadAvailableUnits(undefined, true)]);
        setImportTasksCountAfter(tasksCount);
        setImportSuccess(
          availCount !== null
            ? `Создано заданий: ${createdCount}. Доступных для матчинга: ${availCount}. В списке теперь ${tasksCount} задач.`
            : `Создано заданий: ${createdCount}. В списке теперь ${tasksCount} задач.`
        );
      }
    } catch (e: any) {
      console.error("Import Excel error:", e);
      setImportErrors([e.message || "Ошибка импорта"]);
    } finally {
      setImporting(false);
    }
  }

  // Create tasks
  async function handleCreateTasks() {
    if (selectedUnitIds.size === 0) {
      setError("Выберите хотя бы один заказ");
      return;
    }

    if (!selectedPickingCellId) {
      setError("Выберите целевую ячейку picking");
      return;
    }

    if (scenarioCategory && !scenarioDestination.trim()) {
      setError(`Заполните поле "Точка назначения" для категории "${scenarioCategory}"`);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/ops/picking-tasks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitIds: Array.from(selectedUnitIds),
          targetPickingCellId: selectedPickingCellId,
          scenario: scenarioString || null,
        }),
      });

      // Check if response is JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(text || "Ошибка создания заданий: неверный формат ответа");
      }
      
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Ошибка создания заданий");
      }

      setLastCreatedCount(json.count || 0);
      setSuccess(`Создано заданий: ${json.count || 0}`);
      setSelectedUnitIds(new Set());
      setScenarioCategory("");
      setScenarioDestination("");
      // Reload tasks and units (cacheBust to avoid stale list after create)
      await Promise.all([loadTasks(undefined, true), loadAvailableUnits(undefined, true)]);
    } catch (e: any) {
      setError(e.message || "Ошибка создания заданий");
    } finally {
      setLoading(false);
    }
  }

  // Initial screen: user must select mode before any data loads
  if (mode === null) {
    return (
      <div style={{ maxWidth: 640, margin: "80px auto", padding: 24 }}>
        <h1 style={{ marginBottom: 32, textAlign: "center", fontSize: 22 }}>Создание заданий</h1>
        <ModeSelectorSlider value={null} onChange={setMode} />
      </div>
    );
  }

  // Service mode: yellow dropped units → assign to blue/green with scenario
  if (mode === "service") {
    const POINT_B_LABEL = "СКЛАД";
    return (
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: 24 }}>
        <div style={{ marginBottom: 24 }}>
          <ModeSelectorSlider value="service" onChange={setMode} compact />
        </div>
        <h1 style={{ marginBottom: 24 }}>Создание заданий от сервиса</h1>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 24 }}>
          Жёлтые заказы (дропнул курьер). Перевод на синий или зелёный. Точка А — сценарий OPS, точка Б — {POINT_B_LABEL}.
        </p>

        {serviceError && (
          <Alert variant="error" style={{ marginBottom: 16 }}>{serviceError}</Alert>
        )}
        {serviceSuccess && (
          <Alert variant="success" style={{ marginBottom: 16 }}>{serviceSuccess}</Alert>
        )}

        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <label style={{ fontWeight: 600, fontSize: 16 }}>🟡 Жёлтые заказы (дропы)</label>
            <Button variant="secondary" size="sm" onClick={loadYellowUnits} disabled={loadingYellowUnits}>
              {loadingYellowUnits ? "Загрузка..." : "Обновить"}
            </Button>
          </div>

          {loadingYellowUnits ? (
            <div style={{ padding: 24, textAlign: "center", color: "#666", border: "1px solid #ddd", borderRadius: 8 }}>
              Загрузка...
            </div>
          ) : yellowUnits.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#666", border: "1px solid #ddd", borderRadius: 8 }}>
              Нет жёлтых заказов
            </div>
          ) : (
            <div style={{ border: "1px solid #ddd", borderRadius: 8, overflow: "hidden", maxHeight: 320, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: "#f5f5f5", zIndex: 1 }}>
                  <tr>
                    <th style={{ padding: "10px", textAlign: "center", borderBottom: "1px solid #ddd", fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={yellowUnits.length > 0 && yellowUnits.every((u) => selectedServiceUnitIds.has(u.unit_id))}
                        onChange={handleSelectAllServiceUnits}
                        style={{ cursor: "pointer", width: 16, height: 16 }}
                      />
                    </th>
                    <th style={{ padding: "10px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Штрихкод</th>
                    <th style={{ padding: "10px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Курьер</th>
                    <th style={{ padding: "10px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>OPS статус</th>
                  </tr>
                </thead>
                <tbody>
                  {yellowUnits.map((u) => (
                    <tr
                      key={u.unit_id}
                      style={{
                        borderBottom: "1px solid #eee",
                        background: selectedServiceUnitIds.has(u.unit_id) ? "#fef9c3" : "transparent",
                        cursor: "pointer",
                      }}
                      onClick={() => handleToggleServiceUnit(u.unit_id)}
                    >
                      <td style={{ padding: "10px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedServiceUnitIds.has(u.unit_id)}
                          onChange={() => handleToggleServiceUnit(u.unit_id)}
                          style={{ cursor: "pointer", width: 16, height: 16 }}
                        />
                      </td>
                      <td style={{ padding: "10px", fontWeight: 600 }}>{u.unit_barcode}</td>
                      <td style={{ padding: "10px", fontSize: 13 }}>{u.courier_name}</td>
                      <td style={{ padding: "10px", fontSize: 12, color: "#666" }}>
                        {OPS_STATUS_LABELS[u.ops_status as OpsStatusCode] || u.ops_status || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedServiceUnitIds.size > 0 && (
            <div style={{ marginTop: 16, padding: 16, background: "#f0f9ff", borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Перевести в цвет</div>
              <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setServiceTargetColor("blue")}
                  style={{
                    padding: "10px 20px",
                    border: serviceTargetColor === "blue" ? "2px solid #2563eb" : "1px solid #ddd",
                    borderRadius: 8,
                    background: serviceTargetColor === "blue" ? "#eff6ff" : "#fff",
                    color: "#2563eb",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Синий
                </button>
                <button
                  type="button"
                  onClick={() => setServiceTargetColor("green")}
                  style={{
                    padding: "10px 20px",
                    border: serviceTargetColor === "green" ? "2px solid #22c55e" : "1px solid #ddd",
                    borderRadius: 8,
                    background: serviceTargetColor === "green" ? "#f0fdf4" : "#fff",
                    color: "#22c55e",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Зелёный
                </button>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Точка А (сценарий OPS)</label>
                <input
                  type="text"
                  value={serviceScenario}
                  onChange={(e) => setServiceScenario(e.target.value)}
                  placeholder="Например: СЦ Масазир"
                  style={{
                    width: "100%",
                    maxWidth: 400,
                    padding: "10px 12px",
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
                Точка Б: <strong>{POINT_B_LABEL}</strong> (закреплена за складом)
              </div>
              <Button
                onClick={handleServiceAssign}
                disabled={assigningColor}
                variant="primary"
              >
                {assigningColor ? "Обновление..." : `Перевести ${selectedServiceUnitIds.size} заказов в ${serviceTargetColor === "blue" ? "синий" : "зелёный"}`}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Shipping mode: main content
  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <ModeSelectorSlider value="shipping" onChange={setMode} compact />
      </div>
      <h1 style={{ marginBottom: 24 }}>Создание заданий на отгрузку</h1>

      {error && (
        <Alert variant="error" style={{ marginBottom: 16 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert variant="success" style={{ marginBottom: 16 }}>
          {success}
        </Alert>
      )}

      {importSuccess && (
        <Alert variant="success" style={{ marginBottom: 16 }}>
          {importSuccess}
        </Alert>
      )}

      {importErrors.length > 0 && (
        <Alert variant="error" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Ошибки импорта:</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {importErrors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Available units list */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <label style={{ fontWeight: 600, fontSize: 16 }}>
            📦 Доступные заказы для создания задач
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={handleExportToXLSX} 
              disabled={loadingUnits || availableUnits.length === 0}
              style={{ 
                background: availableUnits.length > 0 ? "#10b981" : undefined,
                color: availableUnits.length > 0 ? "#fff" : undefined,
                borderColor: availableUnits.length > 0 ? "#10b981" : undefined
              }}
            >
              📊 Экспорт в XLSX
            </Button>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={handleExportToCSV} 
              disabled={loadingUnits || availableUnits.length === 0}
              style={{ 
                background: availableUnits.length > 0 ? "#0284c7" : undefined,
                color: availableUnits.length > 0 ? "#fff" : undefined,
                borderColor: availableUnits.length > 0 ? "#0284c7" : undefined
              }}
            >
              📄 Экспорт в CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => loadAvailableUnits()} disabled={loadingUnits}>
              {loadingUnits ? "Загрузка..." : "Обновить"}
            </Button>
          </div>
        </div>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
          Заказы из ячеек storage/shipping (и rejected при включении), которые еще не добавлены в задачи
        </div>

        <div style={{ padding: 12, background: "#f9fafb", borderRadius: 8, border: "1px dashed #d1d5db", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>📥 Импорт заданий из Excel</div>
          {importProgress && (
            <div style={{ fontSize: 13, color: "#1976d2", marginBottom: 8, fontWeight: 600 }}>
              Обработано {importProgress.created} из {importProgress.total} заданий…
            </div>
          )}
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
            Формат колонок: <strong>заказ</strong> / <strong>куда</strong> / <strong>сценарий</strong> / <strong>код ячейки picking</strong>.
            Поле <strong>сценарий</strong> может отличаться от <strong>куда</strong> (обычно ручной ввод).
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
            Для матчинга заказа применяется правило: если номер начинается с <strong>00</strong>, удаляются первые <strong>00</strong> и последние 2 цифры.
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            disabled={importing}
            onChange={(e) => handleImportExcel(e.target.files?.[0] || null)}
            style={{ fontSize: 12 }}
          />
        </div>
        
        {/* Фильтры: OPS статус + rejected + поиск */}
        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ minWidth: 220, flex: "0 0 auto" }}>
            <select
              value={opsStatusFilter}
              onChange={(e) => setOpsStatusFilter(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: 14,
                border: "1px solid #ddd",
                borderRadius: 6,
                background: "#fff",
              }}
            >
              <option value="">Все OPS статусы</option>
              <option value="in_progress">В работе</option>
              <option value="no_status">Без OPS статуса</option>
              <option disabled>──────────</option>
              {Object.entries(OPS_STATUS_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#444" }}>
            <input
              type="checkbox"
              checked={includeRejected}
              onChange={(e) => setIncludeRejected(e.target.checked)}
              style={{ cursor: "pointer", width: 16, height: 16 }}
            />
            Показывать rejected
          </label>
          <div style={{ flex: "1 1 200px" }}>
            <input
              type="text"
              placeholder="🔍 Поиск по штрихкоду, ячейке, статусу..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 14,
                border: "1px solid #ddd",
                borderRadius: 6,
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#2196f3";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#ddd";
              }}
            />
          </div>
          <div style={{ minWidth: 220, flex: "0 0 auto" }}>
            <select
              value={sortAgeOrder}
              onChange={(e) => setSortAgeOrder(e.target.value as "" | "desc" | "asc")}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: 14,
                border: "1px solid #ddd",
                borderRadius: 6,
                background: "#fff",
              }}
            >
              <option value="">Сортировка: время на складе</option>
              <option value="desc">Сначала дольше на складе</option>
              <option value="asc">Сначала меньше на складе</option>
            </select>
          </div>
        </div>

        {loadingUnits ? (
          <div style={{ padding: 24, textAlign: "center", color: "#666", border: "1px solid #ddd", borderRadius: 8 }}>
            Загрузка заказов...
          </div>
        ) : availableUnits.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#666", border: "1px solid #ddd", borderRadius: 8 }}>
            Нет доступных заказов. Все заказы из storage/shipping уже добавлены в задачи или ячейки пусты.
          </div>
        ) : filteredAvailableUnits.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#666", border: "1px solid #ddd", borderRadius: 8 }}>
            {searchQuery.trim() ? `По запросу "${searchQuery}" ничего не найдено` : "Нет доступных заказов"}
          </div>
        ) : (
          <div style={{ border: "1px solid #ddd", borderRadius: 8, overflow: "hidden", maxHeight: 400, overflowY: "auto" }}>
            {(searchQuery.trim() || sortAgeOrder) && (
              <div style={{ padding: "8px 12px", background: "#f0f9ff", borderBottom: "1px solid #ddd", fontSize: 13, color: "#666" }}>
                Найдено: {sortedAvailableUnits.length} из {availableUnits.length} заказов
                {sortAgeOrder && " • Сортировка по времени на складе"}
              </div>
            )}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f5f5f5", zIndex: 1 }}>
                <tr>
                  <th style={{ padding: "12px", textAlign: "center", borderBottom: "1px solid #ddd", fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={sortedAvailableUnits.length > 0 && sortedAvailableUnits.every((u) => selectedUnitIds.has(u.id))}
                      onChange={handleSelectAll}
                      style={{ cursor: "pointer", width: 16, height: 16 }}
                    />
                  </th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Штрихкод</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>На складе</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Текущая ячейка</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Тип</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Статус</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>OPS статус</th>
                </tr>
              </thead>
              <tbody>
                {sortedAvailableUnits.map((unit) => (
                  <tr 
                    key={unit.id} 
                    style={{ 
                      borderBottom: "1px solid #eee",
                      background: selectedUnitIds.has(unit.id) ? "#f0f9ff" : "transparent",
                      cursor: "pointer"
                    }}
                    onClick={(e) => {
                      // If clicking on checkbox column, toggle selection
                      const target = e.target as HTMLElement;
                      if (target.tagName === "INPUT" || target.closest("td")?.querySelector("input[type='checkbox']")) {
                        handleToggleUnit(unit.id);
                      } else {
                        // Otherwise, open details modal
                        handleOpenUnitDetails(unit.id);
                      }
                    }}
                  >
                    <td style={{ padding: "12px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedUnitIds.has(unit.id)}
                        onChange={() => handleToggleUnit(unit.id)}
                        style={{ cursor: "pointer", width: 16, height: 16 }}
                      />
                    </td>
                    <td style={{ padding: "12px", fontWeight: 600 }}>{unit.barcode}</td>
                    <td style={{ padding: "12px" }}>
                      {typeof unit.age_hours === "number" ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 8px",
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            color: getAgeColor(unit.age_hours),
                          }}
                          title="Время на складе (ч/д)"
                        >
                          {formatAge(unit.age_hours)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ padding: "12px" }}>{unit.cell?.code || "—"}</td>
                    <td style={{ padding: "12px" }}>
                      {unit.cell?.cell_type ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 8px",
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            background: unit.cell.cell_type === "storage" ? "#e3f2fd" : "#fff3e0",
                            color: unit.cell.cell_type === "storage" ? "#1976d2" : "#e65100",
                          }}
                        >
                          {unit.cell.cell_type}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ padding: "12px", fontSize: 13, color: "#666" }}>{unit.status}</td>
                    <td style={{ padding: "12px", fontSize: 12 }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 8px",
                          borderRadius: 4,
                          background: unit.ops_status ? "#eef2ff" : "#f3f4f6",
                          color: unit.ops_status ? "#4f46e5" : "#6b7280",
                          fontWeight: 600,
                        }}
                      >
                        {getOpsStatusText(unit.ops_status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedUnitIds.size > 0 && (
          <div style={{ marginTop: 12, padding: 12, background: "#f0f9ff", borderRadius: 6, fontSize: 14 }}>
            <strong>Выбрано заказов:</strong> {selectedUnitIds.size}
          </div>
        )}
      </div>

      {/* Target picking cell */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
          Целевая ячейка picking <span style={{ color: "red" }}>*</span>
        </label>
        <select
          value={selectedPickingCellId}
          onChange={(e) => setSelectedPickingCellId(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid #ddd",
            borderRadius: 6,
            fontSize: 14,
          }}
          disabled={loading}
        >
          <option value="">Выберите ячейку picking</option>
          {pickingCells.map((cell) => {
            // Формируем дополнительную информацию для отображения
            const infoParts: string[] = [];
            if (cell.units_count !== undefined && cell.units_count !== null) {
              infoParts.push(`${cell.units_count} ед.`);
            }
            if (cell.meta?.description) {
              infoParts.push(cell.meta.description);
            }
            const infoText = infoParts.length > 0 ? ` (${infoParts.join(', ')})` : '';
            
            return (
              <option key={cell.id} value={cell.id}>
                {cell.code}{infoText}
              </option>
            );
          })}
        </select>
      </div>

      {/* Scenario */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
          Сценарий (опционально)
        </label>
        
        <div style={{ display: "grid", gap: 12 }}>
          {/* FROM - fixed */}
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#666" }}>
              ОТКУДА
            </label>
            <input
              type="text"
              value={SCENARIO_FROM}
              disabled
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #ddd",
                borderRadius: 6,
                fontSize: 14,
                background: "#f5f5f5",
                color: "#666",
                cursor: "not-allowed",
              }}
            />
          </div>

          {/* TO - Category */}
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#666" }}>
              КУДА (категория)
            </label>
            <select
              value={scenarioCategory}
              onChange={(e) => {
                setScenarioCategory(e.target.value as ScenarioCategory | "");
                setScenarioDestination(""); // Reset destination when category changes
              }}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #ddd",
                borderRadius: 6,
                fontSize: 14,
                background: "#fff",
              }}
              disabled={loading}
            >
              <option value="">Выберите категорию</option>
              <option value="Pudo">Pudo</option>
              <option value="Мерчант">Мерчант</option>
              <option value="Сервис">Сервис</option>
              <option value="Азерпочта">Азерпочта</option>
              <option value="Клиент">Клиент</option>
            </select>
          </div>

          {/* TO - Destination (shown only when category is selected) */}
          {scenarioCategory && (
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#666" }}>
                {scenarioCategory === "Pudo" ? "Точка назначения (выберите из списка)" : "Точка назначения (введите вручную)"}
              </label>
              {scenarioCategory === "Pudo" ? (
                // Dropdown для Pudo с возможностью ввода "Другое"
                <>
                  <select
                    value={scenarioDestination === "Другое" || (scenarioDestination && !SCENARIO_TO_OPTIONS[scenarioCategory].includes(scenarioDestination as any)) ? "" : scenarioDestination}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "Другое") {
                        setScenarioDestination(""); // Очищаем для ввода в input
                      } else {
                        setScenarioDestination(value);
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #ddd",
                      borderRadius: 6,
                      fontSize: 14,
                      background: "#fff",
                      marginBottom: scenarioDestination === "" || (scenarioDestination && !SCENARIO_TO_OPTIONS[scenarioCategory].includes(scenarioDestination as any)) ? "8px" : "0",
                    }}
                    disabled={loading}
                  >
                    <option value="">Выберите пудо точку</option>
                    {SCENARIO_TO_OPTIONS[scenarioCategory].map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {/* Показываем input если выбрано "Другое" или введён произвольный текст (не из списка) */}
                  {(scenarioDestination === "" || (scenarioDestination && !SCENARIO_TO_OPTIONS[scenarioCategory].includes(scenarioDestination as any))) && (
                    <input
                      type="text"
                      value={scenarioDestination}
                      onChange={(e) => setScenarioDestination(e.target.value)}
                      placeholder="Введите название пудо точки вручную"
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid #ddd",
                        borderRadius: 6,
                        fontSize: 14,
                        background: "#fff",
                      }}
                      disabled={loading}
                    />
                  )}
                </>
              ) : (
                // Input для Мерчант, Сервис, Азерпочта, Клиент
                <input
                  type="text"
                  value={scenarioDestination}
                  onChange={(e) => setScenarioDestination(e.target.value)}
                  placeholder={`Введите ${scenarioCategory.toLowerCase() === "мерчант" ? "название мерчанта" : scenarioCategory.toLowerCase() === "сервис" ? "название сервисного центра" : scenarioCategory.toLowerCase() === "азерпочта" ? "адрес или название отделения" : "имя клиента или адрес"}`}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    fontSize: 14,
                    background: "#fff",
                  }}
                  disabled={loading}
                />
              )}
            </div>
          )}

          {/* Preview */}
          {scenarioString && (
            <div
              style={{
                padding: "12px",
                background: "#f0f9ff",
                borderRadius: 6,
                fontSize: 14,
                color: "#1976d2",
                border: "1px solid #bbdefb",
              }}
            >
              <strong>Сценарий:</strong> {scenarioString}
            </div>
          )}
        </div>
      </div>

      {/* Create button */}
      <Button
        onClick={handleCreateTasks}
        disabled={Boolean(loading || selectedUnitIds.size === 0 || !selectedPickingCellId || (scenarioCategory && !scenarioDestination.trim()))}
        style={{ width: "100%" }}
        variant="primary"
      >
        {loading ? "Создание..." : `Создать задания (${selectedUnitIds.size})`}
      </Button>

      {lastCreatedCount !== null && lastCreatedCount > 0 && (
        <div style={{ marginTop: 16, padding: 12, background: "#f0f9ff", borderRadius: 6, fontSize: 14 }}>
          <strong>Готово!</strong> Создано заданий: {lastCreatedCount}. Задания доступны в ТСД в режиме "Отгрузка".
        </div>
      )}

      {/* Picking cells warning */}
      {pickingCells.length === 0 && (
        <Alert variant="error" style={{ marginTop: 24 }}>
          <strong>Нет picking ячеек.</strong> Добавьте на карте склада ячейки с cell_type='picking'.
        </Alert>
      )}

      {/* Tasks table */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>
            Созданные задачи {filteredTasks.length !== tasks.length ? `(${filteredTasks.length} из ${tasks.length})` : `(${tasks.length})`}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" size="sm" onClick={() => loadTasks()} disabled={loadingTasks}>
              {loadingTasks ? "Загрузка..." : "Обновить"}
            </Button>
            {selectedTaskIds.size > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBulkCancelSelected}
                disabled={bulkCanceling}
                style={{ color: "#dc2626", borderColor: "#fecaca" }}
              >
                {bulkCanceling ? "Отмена..." : `Отменить выбранные (${selectedTaskIds.size})`}
              </Button>
            )}
            {cancelableFilteredTasks.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBulkCancelFiltered}
                disabled={bulkCanceling}
                style={{ color: "#b91c1c", borderColor: "#fecaca" }}
              >
                {bulkCanceling ? "Отмена..." : `Отменить все отображаемые (${cancelableFilteredTasks.length})`}
              </Button>
            )}
          </div>
        </div>

        {/* Фильтры по задачам */}
        {tasks.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16, alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#666" }}>Фильтр:</span>
            <select
              value={taskFilterStatus}
              onChange={(e) => setTaskFilterStatus(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            >
              <option value="">Все статусы</option>
              <option value="open">Открыта</option>
              <option value="in_progress">В работе</option>
              <option value="done">Выполнена</option>
            </select>
            <select
              value={taskFilterFromCell}
              onChange={(e) => setTaskFilterFromCell(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            >
              <option value="">Все FROM</option>
              {taskFilterFromCellOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
            <select
              value={taskFilterTargetCell}
              onChange={(e) => setTaskFilterTargetCell(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            >
              <option value="">Все TO</option>
              {taskFilterTargetCellOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
            {(taskFilterStatus || taskFilterFromCell || taskFilterTargetCell) && (
              <button
                type="button"
                onClick={() => { setTaskFilterStatus(""); setTaskFilterFromCell(""); setTaskFilterTargetCell(""); }}
                style={{ padding: "6px 12px", fontSize: 13, color: "#666", background: "#f3f4f6", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }}
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        )}

        {loadingTasks ? (
          <div style={{ padding: 24, textAlign: "center", color: "#666" }}>Загрузка задач...</div>
        ) : tasks.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#666", border: "1px solid #ddd", borderRadius: 8 }}>
            Нет активных задач (open/in_progress)
          </div>
        ) : filteredTasks.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#666", border: "1px solid #ddd", borderRadius: 8 }}>
            Нет задач по выбранным фильтрам
          </div>
        ) : (
          <div style={{ border: "1px solid #ddd", borderRadius: 8, overflowX: "auto", overflowY: "auto", maxHeight: "70vh" }}>
            <table style={{ width: "100%", minWidth: 1200, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                  <th style={{ padding: "12px", width: 40, borderBottom: "1px solid #ddd", fontWeight: 600, fontSize: 12 }}>
                    {cancelableFilteredTasks.length > 0 && (
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.size > 0 && cancelableFilteredTasks.every((t) => selectedTaskIds.has(t.id))}
                        onChange={handleSelectAllTasks}
                        style={{ cursor: "pointer" }}
                        title="Выбрать все отображаемые"
                      />
                    )}
                  </th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600, fontSize: 12 }}>Статус</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600, fontSize: 12 }}>Штрихкод</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600, fontSize: 12 }}>FROM</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600, fontSize: 12 }}>TO</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600, fontSize: 12 }}>Сценарий</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600, fontSize: 12 }}>Создано</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600, fontSize: 12 }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => {
                  const canCancel = task.status === "open" || task.status === "in_progress";
                  return (
                  <tr key={task.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "12px" }}>
                      {canCancel && (
                        <input
                          type="checkbox"
                          checked={selectedTaskIds.has(task.id)}
                          onChange={() => handleToggleTaskSelection(task.id)}
                          disabled={bulkCanceling}
                          style={{ cursor: "pointer" }}
                        />
                      )}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 8px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background:
                            task.status === "done"
                              ? "#e8f5e9"
                              : task.status === "in_progress"
                              ? "#fff3e0"
                              : "#e3f2fd",
                          color:
                            task.status === "done"
                              ? "#2e7d32"
                              : task.status === "in_progress"
                              ? "#e65100"
                              : "#1976d2",
                        }}
                      >
                        {task.status === "open" ? "Открыта" : task.status === "in_progress" ? "В работе" : task.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px", fontWeight: 600 }}>
                      {task.unitCount > 1 
                        ? `${task.unitCount} заказов` 
                        : task.units[0]?.barcode || "—"}
                    </td>
                    <td style={{ padding: "12px", fontSize: 13 }}>
                      {task.fromCells && task.fromCells.length > 0
                        ? task.fromCells.length > 1
                          ? `${task.fromCells.length} ячеек`
                          : `${task.fromCells[0].code} (${task.fromCells[0].cell_type})`
                        : "—"}
                    </td>
                    <td style={{ padding: "12px", fontSize: 13 }}>
                      {task.targetCell ? `${task.targetCell.code} (${task.targetCell.cell_type})` : "—"}
                    </td>
                    <td style={{ padding: "12px", fontSize: 13, color: "#666", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {task.scenario || "—"}
                    </td>
                    <td style={{ padding: "12px", fontSize: 13, color: "#666" }}>
                      {new Date(task.created_at).toLocaleString("ru-RU")}
                    </td>
                    <td style={{ padding: "12px" }}>
                      {(task.status === "open" || task.status === "in_progress") && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={() => openEditScenario(task)}
                            disabled={bulkCanceling}
                            style={{
                              padding: "6px 12px",
                              fontSize: 12,
                              fontWeight: 600,
                              color: bulkCanceling ? "#9ca3af" : "#0369a1",
                              background: bulkCanceling ? "#f3f4f6" : "#f0f9ff",
                              border: `1px solid ${bulkCanceling ? "#d1d5db" : "#bae6fd"}`,
                              borderRadius: 6,
                              cursor: bulkCanceling ? "not-allowed" : "pointer",
                              transition: "all 0.2s",
                              opacity: bulkCanceling ? 0.6 : 1,
                            }}
                          >
                            Сценарий
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Unit Details Modal */}
      {modalUnitId && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          role="button"
          tabIndex={0}
          aria-label="Закрыть модальное окно"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseModal();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleCloseModal();
            }
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              maxWidth: 600,
              width: "90%",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #ddd",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Информация о заказе</h2>
              <button
                onClick={handleCloseModal}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 24,
                  cursor: "pointer",
                  color: "#666",
                  padding: 0,
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: 24 }}>
              {loadingModal ? (
                <div style={{ padding: 40, textAlign: "center", color: "#666" }}>Загрузка...</div>
              ) : modalUnitDetails ? (
                <div style={{ display: "grid", gap: 20 }}>
                  {/* Barcode */}
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
                      {modalUnitDetails.barcode}
                    </div>
                    <div style={{ fontSize: 12, color: "#999" }}>ID: {modalUnitDetails.id}</div>
                  </div>

                  {/* Main Info */}
                  <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 12 }}>Основная информация</div>
                    <div style={{ display: "grid", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Статус</div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{modalUnitDetails.status}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Создан</div>
                        <div style={{ fontSize: 14 }}>
                          {new Date(modalUnitDetails.created_at).toLocaleString("ru-RU")}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Текущая ячейка</div>
                        {modalUnitDetails.cell ? (
                          <div>
                            <div style={{ fontSize: 14, marginBottom: 4 }}>
                              {modalUnitDetails.cell.code} ({modalUnitDetails.cell.cell_type})
                            </div>
                            <a
                              href={`/app/cells/${modalUnitDetails.cell.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "#0066cc", textDecoration: "none", fontSize: 13 }}
                            >
                              Открыть ячейку →
                            </a>
                          </div>
                        ) : (
                          <div style={{ fontSize: 14, color: "#999" }}>Не размещен</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Product Info */}
                  <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 12 }}>Товар</div>
                    {modalUnitDetails.item ? (
                      <div style={{ display: "grid", gap: 12 }}>
                        {modalUnitDetails.item.image_url && (
                          <div>
                            <img
                              src={modalUnitDetails.item.image_url}
                              alt={modalUnitDetails.item.title || "Товар"}
                              style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8 }}
                            />
                          </div>
                        )}
                        <div>
                          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Название</div>
                          <div style={{ fontSize: 14 }}>{modalUnitDetails.item.title || "—"}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>SKU</div>
                          <div style={{ fontSize: 14 }}>{modalUnitDetails.item.sku || "—"}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Производитель</div>
                          <div style={{ fontSize: 14 }}>{modalUnitDetails.item.vendor || "—"}</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 14 }}>
                        Данные товара не добавлены
                      </div>
                    )}
                  </div>

                  {/* Full page link */}
                  <div style={{ textAlign: "center", paddingTop: 8 }}>
                    <a
                      href={`/app/units/${modalUnitDetails.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "#0066cc",
                        textDecoration: "none",
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      Открыть полную страницу →
                    </a>
                  </div>
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: "center", color: "#999" }}>
                  Не удалось загрузить данные
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editingTask && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
          }}
          role="button"
          tabIndex={0}
          aria-label="Закрыть окно редактирования сценария"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditScenario();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              closeEditScenario();
            }
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              width: "min(640px, 92vw)",
              padding: 20,
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
              Редактировать сценарий
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
              Задача: {editingTask.id}
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
              Текущее значение: {editingTask.scenario || "—"}
            </div>
            <textarea
              rows={4}
              value={editingScenarioValue}
              onChange={(e) => setEditingScenarioValue(e.target.value)}
              placeholder="Сценарий (например: Склад Возвратов → Мерчант → Название)"
              disabled={savingScenario}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: 10,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontSize: 14,
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
              Оставьте пустым, чтобы очистить сценарий.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={closeEditScenario}
                disabled={savingScenario}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  color: "#374151",
                  cursor: savingScenario ? "not-allowed" : "pointer",
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSaveScenario}
                disabled={savingScenario}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid #2563eb",
                  background: "#2563eb",
                  color: "#fff",
                  cursor: savingScenario ? "not-allowed" : "pointer",
                }}
              >
                {savingScenario ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
