import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/telegram/send-sla-report
 * Sends SLA report to Telegram (manual trigger by user)
 */
export async function POST(req: Request) {
  // Verify authentication for manual trigger
  const supabase = await supabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id, role")
    .eq("id", userData.user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  try {
    // Fetch metrics using the existing endpoint logic
    const metrics = await fetchSLAMetrics(profile.warehouse_id);
    
    // Format report
    const report = formatSLAReport(metrics);

    // Send to Telegram
    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: report,
          parse_mode: 'HTML',
        }),
      }
    );

    if (!telegramResponse.ok) {
      const error = await telegramResponse.json();
      console.error('Telegram API error:', error);
      throw new Error(`Telegram API error: ${error.description || 'Unknown error'}`);
    }

    return NextResponse.json({ 
      ok: true, 
      message: 'Отчет отправлен в Telegram' 
    });
  } catch (e: any) {
    console.error('Send report error:', e);
    return NextResponse.json(
      { error: e.message || 'Failed to send report' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/telegram/send-sla-report
 * For Vercel Cron (no user auth required)
 */
export async function GET(req: Request) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch metrics for all warehouses (or default warehouse)
    // For simplicity, we'll aggregate basic metrics
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const { data: units } = await supabaseAdmin
      .from('units')
      .select('status, created_at')
      .limit(1000);

    const totalUnits = units?.length || 0;
    const oldUnits = units?.filter(u => {
      const unitDate = new Date(u.created_at);
      return unitDate.getTime() < twentyFourHoursAgo.getTime() && 
             u.status !== 'shipped' && 
             u.status !== 'out';
    }).length || 0;

    // Count by status
    const statusCounts: Record<string, number> = {};
    units?.forEach(u => {
      statusCounts[u.status] = (statusCounts[u.status] || 0) + 1;
    });

    const dateStr = now.toLocaleString('ru-RU', { 
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const report = `📊 <b>SLA ОТЧЕТ</b>
${escapeHtml(dateStr)}

✅ <b>Основные показатели:</b>
• Всего заказов: ${totalUnits}
• Залежалые (&gt;24ч): ${oldUnits} ${oldUnits > 10 ? '🔴' : oldUnits > 5 ? '🟠' : '🟢'}

📦 <b>По статусам:</b>
${Object.entries(statusCounts)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 5)
  .map(([status, count]) => `• ${escapeHtml(String(status))}: ${count}`)
  .join('\n')}

📱 Полный отчет: ${process.env.NEXT_PUBLIC_SITE_URL || ''}/app/sla`;

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: report,
          parse_mode: 'HTML',
        }),
      }
    );

    if (!telegramResponse.ok) {
      const error = await telegramResponse.json();
      throw new Error(`Telegram API error: ${error.description || 'Unknown'}`);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Cron send error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * Fetch SLA metrics for a warehouse
 */
async function fetchSLAMetrics(warehouseId: string) {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Fetch units data
  const [
    { data: oldUnits },
    { data: allUnits }
  ] = await Promise.all([
    supabaseAdmin
      .from("units")
      .select("id, barcode, status, created_at")
      .eq("warehouse_id", warehouseId)
      .lt("created_at", twentyFourHoursAgo.toISOString())
      .neq("status", "shipped")
      .neq("status", "out")
      .order("created_at", { ascending: true })
      .limit(100),
    
    supabaseAdmin
      .from("units")
      .select("status")
      .eq("warehouse_id", warehouseId)
  ]);

  // Group by status
  const unitsByStatus: Record<string, number> = {};
  (allUnits || []).forEach(u => {
    unitsByStatus[u.status] = (unitsByStatus[u.status] || 0) + 1;
  });

  // Fetch picking tasks
  const { data: pickingTasks } = await supabaseAdmin
    .from("picking_tasks")
    .select("status, created_at, completed_at")
    .eq("warehouse_id", warehouseId)
    .gte("created_at", sevenDaysAgo.toISOString());

  const taskTimes: number[] = [];
  (pickingTasks || []).forEach(t => {
    if (t.created_at && t.completed_at) {
      const hours = (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60);
      if (hours > 0 && hours < 100) taskTimes.push(hours);
    }
  });

  const avgTaskTime = taskTimes.length > 0
    ? taskTimes.reduce((a, b) => a + b, 0) / taskTimes.length
    : 0;

  // Fetch OUT shipments
  const { data: outShipments } = await supabaseAdmin
    .from("outbound_shipments")
    .select("status")
    .eq("warehouse_id", warehouseId)
    .gte("out_at", sevenDaysAgo.toISOString());

  const totalShipments = (outShipments || []).length;
  const returnedShipments = (outShipments || []).filter(s => s.status === "returned").length;
  const returnRate = totalShipments > 0 ? (returnedShipments / totalShipments) * 100 : 0;

  // Top oldest units
  const topOldestUnits = (oldUnits || []).slice(0, 3).map(u => ({
    barcode: u.barcode,
    status: u.status,
    age_hours: Math.floor((now.getTime() - new Date(u.created_at).getTime()) / (1000 * 60 * 60)),
  }));

  return {
    total_units: allUnits?.length || 0,
    units_over_24h: oldUnits?.length || 0,
    units_by_status: unitsByStatus,
    picking_avg_time_hours: Math.round(avgTaskTime * 10) / 10,
    picking_total_tasks: pickingTasks?.length || 0,
    picking_completed_tasks: (pickingTasks || []).filter(t => t.status === "done").length,
    out_return_rate_percent: Math.round(returnRate * 10) / 10,
    top_oldest_units: topOldestUnits,
  };
}

/**
 * Format SLA metrics into Telegram message (HTML format) - ПОЛНЫЙ ОТЧЕТ
 */
function formatSLAReport(metrics: any): string {
  const now = new Date();
  const date = now.toLocaleString('ru-RU', { 
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  let report = `📊 <b>ПОЛНЫЙ SLA ОТЧЕТ</b>\n${escapeHtml(date)}\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // ========== КЛЮЧЕВЫЕ ПОКАЗАТЕЛИ ==========
  report += `✅ <b>КЛЮЧЕВЫЕ ПОКАЗАТЕЛИ</b>\n`;
  report += `• Всего заказов: <b>${metrics.total_units}</b>\n`;
  report += `• Залежалые (&gt;24ч): <b>${metrics.units_over_24h}</b> ${metrics.units_over_24h > 10 ? '🔴' : metrics.units_over_24h > 5 ? '🟠' : '🟢'}\n`;
  report += `• Среднее время обработки: <b>${metrics.avg_processing_time_hours}ч</b>\n`;
  report += `• Процент возвратов: <b>${metrics.out_return_rate_percent}%</b> ${metrics.out_return_rate_percent > 20 ? '🔴' : '🟢'}\n`;
  report += `\n`;

  // ========== ВСЕ СТАТУСЫ ==========
  if (Object.keys(metrics.units_by_status).length > 0) {
    report += `📦 <b>РАСПРЕДЕЛЕНИЕ ПО СТАТУСАМ</b>\n`;
    const statuses = Object.entries(metrics.units_by_status)
      .sort(([, a]: any, [, b]: any) => b - a);
    
    for (const [status, count] of statuses) {
      report += `• ${escapeHtml(status)}: <b>${count}</b>\n`;
    }
    report += `\n`;
  }

  // ========== ЗАЛЕЖАЛЫЕ ЗАКАЗЫ ПО СТАТУСАМ ==========
  if (metrics.old_units_by_status && Object.keys(metrics.old_units_by_status).length > 0) {
    report += `⏰ <b>ЗАЛЕЖАЛЫЕ (&gt;24ч) ПО СТАТУСАМ</b>\n`;
    const oldStatuses = Object.entries(metrics.old_units_by_status)
      .sort(([, a]: any, [, b]: any) => b - a);
    
    for (const [status, count] of oldStatuses) {
      report += `• ${escapeHtml(status)}: <b>${count}</b> 🔴\n`;
    }
    report += `\n`;
  }

  // ========== ТОП-10 САМЫХ ДОЛГИХ ЗАКАЗОВ ==========
  if (metrics.top_oldest_units?.length > 0) {
    report += `🚨 <b>ТОП-10 САМЫХ ДОЛГИХ ЗАКАЗОВ</b>\n`;
    for (const unit of metrics.top_oldest_units) {
      const emoji = unit.age_hours > 48 ? '🔴' : '🟠';
      report += `${emoji} ${escapeHtml(unit.barcode)}\n`;
      report += `   └ ${unit.age_hours}ч в статусе ${escapeHtml(unit.status)}\n`;
    }
    report += `\n`;
  }

  // ========== PICKING ПРОИЗВОДИТЕЛЬНОСТЬ ==========
  report += `⏱️ <b>PICKING ПРОИЗВОДИТЕЛЬНОСТЬ</b>\n`;
  const completionRate = metrics.picking_total_tasks > 0
    ? Math.round((metrics.picking_completed_tasks / metrics.picking_total_tasks) * 100)
    : 0;
  report += `• Всего задач: <b>${metrics.picking_total_tasks}</b>\n`;
  report += `• Завершено: <b>${metrics.picking_completed_tasks}</b> (${completionRate}%)\n`;
  report += `• Среднее время: <b>${metrics.picking_avg_time_hours}ч</b>\n`;
  report += `\n`;

  // ========== OUT ОТПРАВКИ ==========
  report += `📦 <b>OUT ОТПРАВКИ (7 дней)</b>\n`;
  report += `• Всего отправок: <b>${metrics.out_total_shipments}</b>\n`;
  report += `• Возвращено: <b>${metrics.out_returned_shipments}</b>\n`;
  report += `• % возвратов: <b>${metrics.out_return_rate_percent}%</b> ${metrics.out_return_rate_percent > 20 ? '🔴' : '🟢'}\n`;
  report += `• Успешно доставлено: <b>${metrics.out_total_shipments - metrics.out_returned_shipments}</b>\n`;
  report += `\n`;

  // ========== BIN ЯЧЕЙКИ (если есть) ==========
  if (metrics.bin_cells && metrics.bin_cells.length > 0) {
    report += `🗄️ <b>BIN ЯЧЕЙКИ (топ-5 по времени)</b>\n`;
    const topBins = metrics.bin_cells.slice(0, 5);
    for (const bin of topBins) {
      const totalHours = bin.time_in_cell_hours;
      const emoji = totalHours > 48 ? '🔴' : totalHours > 24 ? '🟠' : '🟢';
      report += `${emoji} ${escapeHtml(bin.cell_code)}: ${escapeHtml(bin.unit_barcode)}\n`;
      report += `   └ ${bin.time_in_cell_hours}ч ${bin.time_in_cell_minutes}мин в ячейке\n`;
    }
    report += `\n`;
  }

  // ========== ВОЗРАСТНОЕ РАСПРЕДЕЛЕНИЕ ==========
  if (metrics.age_distribution) {
    const dist = metrics.age_distribution;
    const hasData = Object.values(dist).some((v: any) => v > 0);
    
    if (hasData) {
      report += `📊 <b>ВОЗРАСТНОЕ РАСПРЕДЕЛЕНИЕ</b>\n`;
      if (dist.under_1h > 0) report += `• &lt;1ч: ${dist.under_1h}\n`;
      if (dist["1_6h"] > 0) report += `• 1-6ч: ${dist["1_6h"]}\n`;
      if (dist["6_12h"] > 0) report += `• 6-12ч: ${dist["6_12h"]}\n`;
      if (dist["12_24h"] > 0) report += `• 12-24ч: ${dist["12_24h"]}\n`;
      if (dist["24_48h"] > 0) report += `• 24-48ч: ${dist["24_48h"]} 🟠\n`;
      if (dist.over_48h > 0) report += `• &gt;48ч: ${dist.over_48h} 🔴\n`;
      report += `\n`;
    }
  }

  // ========== ИТОГО ==========
  report += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  report += `📱 <a href="${process.env.NEXT_PUBLIC_SITE_URL || ''}/app/sla">Открыть дашборд</a>`;

  return report;
}

/**
 * Escape HTML special characters for Telegram
 */
function escapeHtml(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
