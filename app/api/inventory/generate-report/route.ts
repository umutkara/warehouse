import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Get profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("warehouse_id, role, full_name")
      .eq("id", authData.user.id)
      .single();

    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    }

    if (!profile.role || !["admin", "head", "manager"].includes(profile.role)) {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }

    // Get sessionId from body
    const body = await req.json();
    let sessionId = body?.sessionId;

    if (!sessionId) {
      // Try to get from active or last closed session
      const { data: warehouse } = await supabase
        .from("warehouses")
        .select("inventory_session_id, inventory_active")
        .eq("id", profile.warehouse_id)
        .single();

      if (warehouse?.inventory_session_id) {
        sessionId = warehouse.inventory_session_id;
      } else {
        // Get last closed session
        const { data: lastSession } = await supabase
          .from("inventory_sessions")
          .select("id")
          .eq("warehouse_id", profile.warehouse_id)
          .eq("status", "closed")
          .order("closed_at", { ascending: false })
          .limit(1)
          .single();

        if (lastSession) {
          sessionId = lastSession.id;
        }
      }
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId не указан и активная сессия не найдена" },
        { status: 400 }
      );
    }

    // Get session details
    const { data: session } = await supabase
      .from("inventory_sessions")
      .select("id, status, started_at, closed_at, warehouse_id")
      .eq("id", sessionId)
      .single();

    if (!session || session.warehouse_id !== profile.warehouse_id) {
      return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
    }

    // Get full report data
    const reportRes = await fetch(
      `${req.headers.get("origin")}/api/inventory/session-report?sessionId=${sessionId}`,
      {
        headers: {
          cookie: req.headers.get("cookie") || "",
        },
      }
    );

    if (!reportRes.ok) {
      return NextResponse.json({ error: "Ошибка получения данных отчёта" }, { status: 500 });
    }

    const reportData = await reportRes.json();

    // Generate CSV report (simple format, can be opened in Excel)
    const csvLines: string[] = [];
    
    // Header
    csvLines.push("Отчёт по инвентаризации");
    csvLines.push(`Дата создания: ${new Date().toLocaleString("ru-RU")}`);
    csvLines.push(`Сессия: ${sessionId}`);
    csvLines.push(`Статус: ${session.status}`);
    csvLines.push(`Начата: ${new Date(session.started_at).toLocaleString("ru-RU")}`);
    if (session.closed_at) {
      csvLines.push(`Завершена: ${new Date(session.closed_at).toLocaleString("ru-RU")}`);
    }
    csvLines.push("");
    
    // Summary
    csvLines.push("Общие показатели:");
    csvLines.push(`Всего ячеек,${reportData.totals.cellsTotal}`);
    csvLines.push(`Отсканировано,${reportData.totals.cellsScanned}`);
    csvLines.push(`Ячеек с расхождениями,${reportData.totals.cellsWithDiff}`);
    csvLines.push(`Ожидалось заказов,${reportData.totals.unitsExpectedTotal}`);
    csvLines.push(`Найдено заказов,${reportData.totals.unitsScannedTotal}`);
    csvLines.push("");
    
    // Details
    csvLines.push("Детали по ячейкам:");
    csvLines.push("Ячейка,Тип,Ожидалось,Найдено,Не найдено,Лишние,Неизвестные");
    
    for (const row of reportData.rows) {
      csvLines.push(
        `${row.cell.code},${row.cell.cell_type},${row.expectedCount},${row.scannedCount},${row.missingCount},${row.extraCount},${row.unknownCount}`
      );
    }
    
    // Подробная информация по расхождениям
    csvLines.push("");
    csvLines.push("ПОДРОБНАЯ ИНФОРМАЦИЯ ПО РАСХОЖДЕНИЯМ:");
    csvLines.push("");
    
    for (const row of reportData.rows) {
      const hasDiff = row.missingCount > 0 || row.extraCount > 0 || row.unknownCount > 0;
      if (!hasDiff) continue; // Пропускаем ячейки без расхождений
      
      csvLines.push(`Ячейка: ${row.cell.code} (${row.cell.cell_type})`);
      
      if (row.missingCount > 0 && row.missing) {
        csvLines.push(`  НЕ НАЙДЕНО (${row.missingCount}):`);
        row.missing.forEach((barcode: string) => {
          csvLines.push(`    ${barcode}`);
        });
      }
      
      if (row.extraCount > 0 && row.extra) {
        csvLines.push(`  ЛИШНИЕ (${row.extraCount}):`);
        row.extra.forEach((barcode: string) => {
          csvLines.push(`    ${barcode}`);
        });
      }
      
      if (row.unknownCount > 0 && row.unknown) {
        csvLines.push(`  НЕИЗВЕСТНЫЕ (${row.unknownCount}):`);
        row.unknown.forEach((barcode: string) => {
          csvLines.push(`    ${barcode}`);
        });
      }
      
      csvLines.push(""); // Пустая строка между ячейками
    }

    const csvContent = csvLines.join("\n");
    const csvBuffer = Buffer.from("\ufeff" + csvContent, "utf-8"); // Add BOM for Excel
    
    // Save to Supabase Storage
    const fileName = `inventory-report-${sessionId}-${Date.now()}.csv`;
    const filePath = `inventory-reports/${fileName}`;

    console.log("Attempting to upload report:", { fileName, filePath, bufferSize: csvBuffer.length });

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("warehouse-files")
      .upload(filePath, csvBuffer, {
        contentType: "text/csv",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error details:", {
        message: uploadError.message,
        name: uploadError.name,
        cause: (uploadError as any)?.cause,
        statusCode: (uploadError as any)?.statusCode,
      });
      
      return NextResponse.json(
        { 
          error: "Ошибка сохранения файла", 
          details: uploadError.message,
          errorName: uploadError.name,
          filePath,
          fileName,
        },
        { status: 500 }
      );
    }

    console.log("Upload successful:", uploadData);

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from("warehouse-files")
      .getPublicUrl(filePath);

    // Audit log
    await supabase.rpc("audit_log_event", {
      p_action: "inventory.generate_report",
      p_entity_type: "inventory_session",
      p_entity_id: sessionId,
      p_summary: `Сгенерирован отчёт по инвентаризации`,
      p_meta: {
        session_id: sessionId,
        file_path: filePath,
        file_name: fileName,
        generated_by: authData.user.id,
        generated_by_name: profile.full_name,
      },
    });

    return NextResponse.json({
      ok: true,
      filePath,
      fileName,
      publicUrl: urlData.publicUrl,
      sessionId,
    });
  } catch (e: any) {
    console.error("inventory/generate-report error:", e);
    return NextResponse.json(
      { error: e?.message || "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
