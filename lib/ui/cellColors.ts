/**
 * Helper для получения цветов ячеек по типу
 * Используется в карте склада и в этикетках
 */

export function getCellColor(cell_type: string, meta?: any): string {
  // Если ячейка заблокирована, возвращаем цвет блока
  if (meta?.blocked) return "#ffebee";
  
  // Цвета по типу ячейки (только реальные типы)
  switch (cell_type) {
    case "bin": return "#fff8e1"; // жёлтый
    case "storage": return "#e8f5e9"; // зелёный
    case "shipping": return "#f3e5f5"; // фиолетовый
    case "picking": return "#e3f2fd"; // голубой
    case "surplus": return "#fff3e0"; // оранжевый (излишки)
    default: return "#ffffff"; // белый
  }
}
