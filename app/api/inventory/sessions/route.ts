import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { hasAnyRole } from "@/app/api/_shared/role-access";

type SessionRow = {
  id: string;
  status: string | null;
  started_at: string | null;
  closed_at: string | null;
  started_by?: string | null;
  closed_by?: string | null;
};

export async function GET() {
  try {
    const supabase = await supabaseServer();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("warehouse_id, role")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile?.warehouse_id) {
      return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    }

    if (!profile.role || !hasAnyRole(profile.role, ["admin", "head", "manager"])) {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }

    const { data: warehouse } = await supabase
      .from("warehouses")
      .select("inventory_session_id")
      .eq("id", profile.warehouse_id)
      .single();

    let sessions: SessionRow[] = [];
    const { data: sessionsWithUsers, error: sessionsWithUsersError } = await supabase
      .from("inventory_sessions")
      .select("id, status, started_at, closed_at, started_by, closed_by")
      .eq("warehouse_id", profile.warehouse_id)
      .order("started_at", { ascending: false })
      .limit(100);

    if (sessionsWithUsersError) {
      const { data: sessionsFallback, error: sessionsFallbackError } = await supabase
        .from("inventory_sessions")
        .select("id, status, started_at, closed_at")
        .eq("warehouse_id", profile.warehouse_id)
        .order("started_at", { ascending: false })
        .limit(100);
      if (sessionsFallbackError) {
        return NextResponse.json(
          { error: sessionsFallbackError.message || "Не удалось загрузить сессии" },
          { status: 500 },
        );
      }
      sessions = (sessionsFallback || []) as SessionRow[];
    } else {
      sessions = (sessionsWithUsers || []) as SessionRow[];
    }

    const userIds = Array.from(
      new Set(
        sessions
          .flatMap((session) => [session.started_by, session.closed_by])
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    );
    const profilesById = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      (users || []).forEach((user: { id: string; full_name: string | null }) => {
        profilesById.set(user.id, user.full_name || user.id);
      });
    }

    const mapped = sessions.map((session) => {
      const startedByName =
        typeof session.started_by === "string"
          ? profilesById.get(session.started_by) || session.started_by
          : null;
      const startedAtText = session.started_at
        ? new Date(session.started_at).toLocaleString("ru-RU")
        : "—";
      const statusText = session.status === "active" ? "Активна" : "Завершена";
      const label = `${statusText} — ${startedAtText}`;
      return {
        id: session.id,
        status: session.status || "unknown",
        startedAt: session.started_at,
        closedAt: session.closed_at,
        startedBy: session.started_by || null,
        startedByName,
        closedBy: session.closed_by || null,
        closedByName:
          typeof session.closed_by === "string"
            ? profilesById.get(session.closed_by) || session.closed_by
            : null,
        label,
      };
    });

    return NextResponse.json({
      ok: true,
      activeSessionId: warehouse?.inventory_session_id ?? null,
      sessions: mapped,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
