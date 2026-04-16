import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasAnyRole } from "@/app/api/_shared/role-access";

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

    if (!profile.role || !hasAnyRole(profile.role, ["admin", "head", "manager"])) {
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
    let session: any = null;
    const { data: sessionWithUsers, error: sessionWithUsersError } = await supabase
      .from("inventory_sessions")
      .select("id, status, started_at, closed_at, warehouse_id, started_by, closed_by")
      .eq("id", sessionId)
      .single();
    if (sessionWithUsersError) {
      const { data: sessionFallback, error: sessionFallbackError } = await supabase
        .from("inventory_sessions")
        .select("id, status, started_at, closed_at, warehouse_id")
        .eq("id", sessionId)
        .single();
      if (sessionFallbackError || !sessionFallback) {
        return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
      }
      session = sessionFallback;
    } else {
      session = sessionWithUsers;
    }

    if (!session || session.warehouse_id !== profile.warehouse_id) {
      return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
    }

    // Get full report data
    const reportUrl = new URL("/api/inventory/session-report", req.url);
    reportUrl.searchParams.set("sessionId", sessionId);
    const reportRes = await fetch(reportUrl.toString(), {
      headers: {
        cookie: req.headers.get("cookie") || "",
      },
    });

    if (!reportRes.ok) {
      return NextResponse.json({ error: "Ошибка получения данных отчёта" }, { status: 500 });
    }

    const reportData = await reportRes.json();
    const rows = Array.isArray(reportData?.rows) ? reportData.rows : [];
    const totals = reportData?.totals || {
      cellsTotal: 0,
      cellsScanned: 0,
      cellsWithDiff: 0,
      unitsExpectedTotal: 0,
      unitsScannedTotal: 0,
    };
    const reportSession = reportData?.session || {};

    const startedByName = reportSession?.started_by_name || reportSession?.started_by || "—";
    const closedByName = reportSession?.closed_by_name || reportSession?.closed_by || "—";
    const { PDFDocument, rgb } = await import("pdf-lib");
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    const robotoVfsModule = (await import("pdfmake/build/vfs_fonts")) as any;
    const robotoVfs = (robotoVfsModule?.default || robotoVfsModule) as Record<string, string>;
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const regularBase64 = robotoVfs["Roboto-Regular.ttf"];
    const boldBase64 = robotoVfs["Roboto-Medium.ttf"] || robotoVfs["Roboto-Bold.ttf"];
    if (!regularBase64 || !boldBase64) {
      return NextResponse.json(
        { error: "Не удалось загрузить шрифты Roboto для PDF акта" },
        { status: 500 },
      );
    }

    const fontBytes = Buffer.from(regularBase64, "base64");
    const boldFontBytes = Buffer.from(boldBase64, "base64");

    const font = await pdfDoc.embedFont(fontBytes);
    const boldFont = await pdfDoc.embedFont(boldFontBytes);
    const pageWidth = 595.28; // A4 portrait
    const pageHeight = 841.89;
    const margin = 40;
    const maxTextWidth = pageWidth - margin * 2;
    const lineHeight = 14;
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const ensureSpace = (lines = 1) => {
      if (y - lines * lineHeight < margin) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
    };

    const splitLongToken = (token: string, maxLen = 26): string[] => {
      if (token.length <= maxLen) return [token];
      const parts: string[] = [];
      for (let i = 0; i < token.length; i += maxLen) parts.push(token.slice(i, i + maxLen));
      return parts;
    };

    const wrapText = (text: string, textFont: any, size: number): string[] => {
      const words = text
        .split(/\s+/)
        .flatMap((word) => splitLongToken(word))
        .filter((w) => w.length > 0);
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (textFont.widthOfTextAtSize(candidate, size) <= maxTextWidth) {
          current = candidate;
        } else {
          if (current) lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
      return lines.length > 0 ? lines : [""];
    };

    const drawText = (text: string, opts?: { bold?: boolean; size?: number; color?: any }) => {
      const size = opts?.size ?? 10;
      const textFont = opts?.bold ? boldFont : font;
      const color = opts?.color ?? rgb(0.1, 0.1, 0.1);
      const lines = wrapText(text, textFont, size);
      ensureSpace(lines.length);
      lines.forEach((line) => {
        page.drawText(line, { x: margin, y, size, font: textFont, color });
        y -= lineHeight;
      });
    };

    const drawSpacer = (px = 8) => {
      y -= px;
      if (y < margin) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
    };

    const asList = (value: unknown): string[] => (Array.isArray(value) ? value.map((v) => String(v)) : []);

    drawText("АКТ ИНВЕНТАРИЗАЦИИ", { bold: true, size: 16 });
    drawText(`Дата формирования: ${new Date().toLocaleString("ru-RU")}`, { size: 10 });
    drawText(`Сессия: ${sessionId}`, { size: 10 });
    drawSpacer(4);
    drawText(`Статус сессии: ${reportSession.status || session.status || "—"}`, { size: 10 });
    drawText(`Начата: ${reportSession.started_at ? new Date(reportSession.started_at).toLocaleString("ru-RU") : "—"}`, { size: 10 });
    drawText(`Завершена: ${reportSession.closed_at ? new Date(reportSession.closed_at).toLocaleString("ru-RU") : "—"}`, { size: 10 });
    drawText(`Запустил инвентаризацию: ${startedByName}`, { size: 10 });
    drawText(`Закрыл инвентаризацию: ${closedByName}`, { size: 10 });
    drawText(`Сформировал акт: ${profile.full_name || authData.user.id}`, { size: 10 });
    drawSpacer(10);

    drawText("СВОДКА", { bold: true, size: 13 });
    drawText(`- Всего ячеек в сессии: ${totals.cellsTotal}`, { size: 10 });
    drawText(`- Отсканировано ячеек: ${totals.cellsScanned}`, { size: 10 });
    drawText(`- Ячеек с расхождениями: ${totals.cellsWithDiff}`, { size: 10 });
    drawText(`- Ожидалось юнитов: ${totals.unitsExpectedTotal}`, { size: 10 });
    drawText(`- Отсканировано юнитов: ${totals.unitsScannedTotal}`, { size: 10 });
    drawSpacer(10);

    drawText("ДЕТАЛИ ПО ЯЧЕЙКАМ", { bold: true, size: 13 });
    if (rows.length === 0) {
      drawText("Данные отсутствуют.", { size: 10 });
    } else {
      rows.forEach((row: any, idx: number) => {
        const scanned = asList(row.scanned);
        const lost = asList(row.lost).length > 0 ? asList(row.lost) : asList(row.missing);
        const extra = asList(row.extra);
        const unknown = asList(row.unknown);
        drawSpacer(6);
        drawText(`${idx + 1}. Ячейка ${row.cell?.code || "—"} (${row.cell?.cell_type || "—"})`, {
          bold: true,
          size: 11,
        });
        drawText(`   Статус: ${row.status || "—"}`, { size: 10 });
        drawText(`   Сканировал: ${row.scannedByName || row.scannedBy || "—"}`, { size: 10 });
        drawText(
          `   Время скана: ${row.scannedAt ? new Date(row.scannedAt).toLocaleString("ru-RU") : "—"}`,
          { size: 10 },
        );
        drawText(
          `   Показатели: ожидалось=${row.expectedCount ?? 0}, отсканировано=${row.scannedCount ?? 0}, потеряно=${row.lostCount ?? row.missingCount ?? 0}, лишние=${row.extraCount ?? 0}, неизвестные=${row.unknownCount ?? 0}`,
          { size: 10 },
        );
        drawText(`   Что сканировали: ${scanned.join(", ") || "—"}`, { size: 9 });
        drawText(`   Потерянные (не отсканированы): ${lost.join(", ") || "—"}`, { size: 9 });
        drawText(`   Лишние: ${extra.join(", ") || "—"}`, { size: 9 });
        drawText(`   Неизвестные: ${unknown.join(", ") || "—"}`, { size: 9 });
      });
    }

    const pdfBytes = await pdfDoc.save();
    const fileBuffer = Buffer.from(pdfBytes);
    const fileName = `inventory-act-${sessionId}-${Date.now()}.pdf`;
    const filePath = `inventory-reports/${fileName}`;

    console.log("Attempting to upload report:", { fileName, filePath, bufferSize: fileBuffer.length });

    const { data: bucketInfo, error: bucketInfoError } = await supabaseAdmin.storage.getBucket(
      "warehouse-files",
    );
    const allowedMimeTypes =
      ((bucketInfo as any)?.allowed_mime_types as string[] | undefined) ||
      ((bucketInfo as any)?.allowedMimeTypes as string[] | undefined) ||
      null;

    if (Array.isArray(allowedMimeTypes) && allowedMimeTypes.length > 0 && !allowedMimeTypes.includes("application/pdf")) {
      return NextResponse.json(
        {
          error: "Bucket warehouse-files не разрешает application/pdf. Добавьте этот MIME в allowed_mime_types.",
          allowedMimeTypes,
        },
        { status: 500 },
      );
    }

    const uploadMime = "application/pdf";

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("warehouse-files")
      .upload(filePath, fileBuffer, {
        contentType: uploadMime,
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
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
      .from("warehouse-files")
      .createSignedUrl(filePath, 60 * 60);
    const downloadUrl = signedUrlData?.signedUrl || urlData.publicUrl;

    // Audit log
    await supabase.rpc("audit_log_event", {
      p_action: "inventory.generate_report",
      p_entity_type: "inventory_session",
      p_entity_id: sessionId,
      p_summary: `Сгенерирован акт инвентаризации`,
      p_meta: {
        session_id: sessionId,
        file_path: filePath,
        file_name: fileName,
        generated_by: authData.user.id,
        generated_by_name: profile.full_name,
        format: "pdf-a4-act",
      },
    });

    return NextResponse.json({
      ok: true,
      filePath,
      fileName,
      publicUrl: urlData.publicUrl,
      signedUrl: signedUrlData?.signedUrl ?? null,
      downloadUrl,
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
