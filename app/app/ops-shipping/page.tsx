"use client";

import { useState, useEffect } from "react";
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
};

type OpsStatusCode = keyof typeof OPS_STATUS_LABELS;

function getOpsStatusText(status: string | null | undefined): string {
  if (!status) return "Не назначен";
  return OPS_STATUS_LABELS[status as OpsStatusCode] || status;
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

export default function OpsShippingPage() {
  const [availableUnits, setAvailableUnits] = useState<UnitWithCell[]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [pickingCells, setPickingCells] = useState<Cell[]>([]);
  const [selectedPickingCellId, setSelectedPickingCellId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [opsStatusFilter, setOpsStatusFilter] = useState<string>("");
  
  // Scenario state
  const [scenarioCategory, setScenarioCategory] = useState<ScenarioCategory | "">("");
  const [scenarioDestination, setScenarioDestination] = useState<string>("");
  
  const [loading, setLoading] = useState(false);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [cancelingTaskId, setCancelingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastCreatedCount, setLastCreatedCount] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  
  // Modal state
  const [modalUnitId, setModalUnitId] = useState<string | null>(null);
  const [modalUnitDetails, setModalUnitDetails] = useState<UnitDetails | null>(null);
  const [loadingModal, setLoadingModal] = useState(false);

  // Compute final scenario string
  const scenarioString = scenarioCategory && scenarioDestination
    ? `${SCENARIO_FROM} → ${scenarioCategory} → ${scenarioDestination}`
    : "";

  // Load picking cells, available units and tasks on mount
  useEffect(() => {
    async function loadPickingCells() {
      try {
        const res = await fetch("/api/cells/list", { cache: "no-store" });
        const json = await res.json();
        if (res.ok) {
          const picking = (json.cells || []).filter((c: Cell) => c.cell_type === "picking");
          setPickingCells(picking);
          if (picking.length === 0) {
            setError("Нет picking ячеек. Добавьте на карте склада ячейки с cell_type='picking'");
          }
        }
      } catch (e) {
        console.error("Failed to load picking cells:", e);
        setError("Ошибка загрузки ячеек");
      }
    }
    loadPickingCells();
    loadAvailableUnits();
    loadTasks();
  }, []);

  // Load available units from storage/shipping
  async function loadAvailableUnits() {
    setLoadingUnits(true);
    setError(null);
    try {
      const res = await fetch("/api/units/storage-shipping", { cache: "no-store" });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Non-JSON response from /api/units/storage-shipping:", text);
        setAvailableUnits([]);
        return;
      }
      
      const json = await res.json();
      if (res.ok) {
        setAvailableUnits(json.units || []);
      } else {
        console.error("Error loading units:", json.error || "Unknown error");
        setError(json.error || "Ошибка загрузки заказов");
        setAvailableUnits([]);
      }
    } catch (e: any) {
      console.error("Failed to load units:", e);
      setError("Ошибка загрузки заказов");
      setAvailableUnits([]);
    } finally {
      setLoadingUnits(false);
    }
  }

  // Load tasks
  async function loadTasks() {
    setLoadingTasks(true);
    try {
      const res = await fetch("/api/tsd/shipping-tasks/list", { cache: "no-store" });
      
      // Check if response is JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Non-JSON response from /api/tsd/shipping-tasks/list:", text);
        setTasks([]);
        return;
      }
      
      const json = await res.json();
      if (res.ok) {
        setTasks(json.tasks || []);
      } else {
        console.error("Error loading tasks:", json.error || "Unknown error");
        setTasks([]);
      }
    } catch (e: any) {
      console.error("Failed to load tasks:", e);
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  }

  async function handleCancelTask(taskId: string) {
    if (!confirm("Вы уверены? Все заказы в задаче вернутся в исходные ячейки, а задача исчезнет из ТСД.")) {
      return;
    }

    setCancelingTaskId(taskId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/picking-tasks/${taskId}/cancel`, {
        method: "POST",
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to cancel task");
      }

      setSuccess(`Задача отменена. Возвращено ${json.units_returned} заказов в исходные ячейки.`);
      
      // Обновить список задач
      await loadTasks();
      
      // Обновить список доступных units
      await loadAvailableUnits();

    } catch (e: any) {
      setError(`Ошибка отмены задачи: ${e.message}`);
    } finally {
      setCancelingTaskId(null);
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

  // Select all units (based on filtered list)
  function handleSelectAll() {
    if (selectedUnitIds.size === filteredAvailableUnits.length && filteredAvailableUnits.length > 0) {
      // Deselect all filtered units
      const filteredIds = new Set(filteredAvailableUnits.map((u) => u.id));
      setSelectedUnitIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      // Select all filtered units
      const filteredIds = new Set(filteredAvailableUnits.map((u) => u.id));
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
      const headers = [
        "Штрихкод",
        "Статус",
        "Ячейка",
        "Тип ячейки",
        "Создан",
      ];

      const rows = availableUnits.map((unit) => {
        const createdAt = unit.created_at ? new Date(unit.created_at).toLocaleString("ru-RU") : "";
        
        return {
          "Штрихкод": unit.barcode || "",
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
        "Статус",
        "Ячейка",
        "Тип ячейки",
        "Создан",
      ];

      // Generate CSV rows
      const rows = availableUnits.map((unit) => {
        const createdAt = unit.created_at ? new Date(unit.created_at).toLocaleString("ru-RU") : "";
        
        return [
          unit.barcode || "",
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
      // Reload tasks and units
      await Promise.all([loadTasks(), loadAvailableUnits()]);
    } catch (e: any) {
      setError(e.message || "Ошибка создания заданий");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
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
            <Button variant="secondary" size="sm" onClick={loadAvailableUnits} disabled={loadingUnits}>
              {loadingUnits ? "Загрузка..." : "Обновить"}
            </Button>
          </div>
        </div>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
          Заказы из ячеек storage/shipping, которые еще не добавлены в задачи
        </div>
        
        {/* Фильтры: OPS статус + поиск */}
        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
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
            {searchQuery.trim() && (
              <div style={{ padding: "8px 12px", background: "#f0f9ff", borderBottom: "1px solid #ddd", fontSize: 13, color: "#666" }}>
                Найдено: {filteredAvailableUnits.length} из {availableUnits.length} заказов
              </div>
            )}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f5f5f5", zIndex: 1 }}>
                <tr>
                  <th style={{ padding: "12px", textAlign: "center", borderBottom: "1px solid #ddd", fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={filteredAvailableUnits.length > 0 && filteredAvailableUnits.every((u) => selectedUnitIds.has(u.id))}
                      onChange={handleSelectAll}
                      style={{ cursor: "pointer", width: 16, height: 16 }}
                    />
                  </th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Штрихкод</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Текущая ячейка</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Тип</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Статус</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>OPS статус</th>
                </tr>
              </thead>
              <tbody>
                {filteredAvailableUnits.map((unit) => (
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Созданные задачи ({tasks.length})</h2>
          <Button variant="secondary" size="sm" onClick={loadTasks} disabled={loadingTasks}>
            {loadingTasks ? "Загрузка..." : "Обновить"}
          </Button>
        </div>

        {loadingTasks ? (
          <div style={{ padding: 24, textAlign: "center", color: "#666" }}>Загрузка задач...</div>
        ) : tasks.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#666", border: "1px solid #ddd", borderRadius: 8 }}>
            Нет активных задач (open/in_progress)
          </div>
        ) : (
          <div style={{ border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
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
                {tasks.map((task) => (
                  <tr key={task.id} style={{ borderBottom: "1px solid #eee" }}>
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
                        <button
                          onClick={() => handleCancelTask(task.id)}
                          disabled={cancelingTaskId === task.id}
                          style={{
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 600,
                            color: cancelingTaskId === task.id ? "#9ca3af" : "#dc2626",
                            background: cancelingTaskId === task.id ? "#f3f4f6" : "#fef2f2",
                            border: `1px solid ${cancelingTaskId === task.id ? "#d1d5db" : "#fecaca"}`,
                            borderRadius: 6,
                            cursor: cancelingTaskId === task.id ? "not-allowed" : "pointer",
                            transition: "all 0.2s",
                            opacity: cancelingTaskId === task.id ? 0.6 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (cancelingTaskId !== task.id) {
                              e.currentTarget.style.background = "#fee2e2";
                              e.currentTarget.style.borderColor = "#fca5a5";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (cancelingTaskId !== task.id) {
                              e.currentTarget.style.background = "#fef2f2";
                              e.currentTarget.style.borderColor = "#fecaca";
                            }
                          }}
                        >
                          {cancelingTaskId === task.id ? "Отмена..." : "Отменить"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
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
          onClick={handleCloseModal}
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
            onClick={(e) => e.stopPropagation()}
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
    </div>
  );
}
