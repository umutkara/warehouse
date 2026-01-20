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
 * Format SLA metrics into Telegram message (HTML format)
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

  let report = `📊 <b>SLA ОТЧЕТ</b>\n${escapeHtml(date)}\n\n`;

  // Key metrics
  report += `✅ <b>Основные показатели:</b>\n`;
  report += `• Всего заказов: ${metrics.total_units}\n`;
  report += `• Залежалые (&gt;24ч): ${metrics.units_over_24h} ${metrics.units_over_24h > 10 ? '🔴' : metrics.units_over_24h > 5 ? '🟠' : '🟢'}\n`;
  report += `• Возвратов: ${metrics.out_return_rate_percent}% ${metrics.out_return_rate_percent > 20 ? '🔴' : '🟢'}\n\n`;

  // Status breakdown
  if (Object.keys(metrics.units_by_status).length > 0) {
    report += `📦 <b>По статусам:</b>\n`;
    const statuses = Object.entries(metrics.units_by_status)
      .sort(([, a]: any, [, b]: any) => b - a)
      .slice(0, 5);
    
    for (const [status, count] of statuses) {
      report += `• ${escapeHtml(status)}: ${count}\n`;
    }
    report += '\n';
  }

  // Old units warning
  if (metrics.units_over_24h > 0 && metrics.top_oldest_units?.length > 0) {
    report += `⚠️ <b>Требуют внимания:</b>\n`;
    for (const unit of metrics.top_oldest_units) {
      report += `• ${escapeHtml(unit.barcode)} - ${unit.age_hours}ч (${escapeHtml(unit.status)})\n`;
    }
    report += '\n';
  }

  // Performance
  report += `🎯 <b>Производительность:</b>\n`;
  const completionRate = metrics.picking_total_tasks > 0
    ? Math.round((metrics.picking_completed_tasks / metrics.picking_total_tasks) * 100)
    : 0;
  report += `• Задачи: ${metrics.picking_completed_tasks}/${metrics.picking_total_tasks} (${completionRate}%)\n`;
  report += `• Среднее picking: ${metrics.picking_avg_time_hours}ч\n`;

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
