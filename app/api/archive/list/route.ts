import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const supabase = await supabaseServer();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get warehouse_id from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("warehouse_id")
      .eq("id", authData.user.id)
      .single();

    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
    }

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
    const cursor = url.searchParams.get("cursor");
    const action = url.searchParams.get("action");
    const entityType = url.searchParams.get("entityType");
    const actor = url.searchParams.get("actor");
    const q = url.searchParams.get("q");

    // Build query (use admin to bypass RLS and avoid recursion)
    let query = supabaseAdmin
      .from("audit_events")
      .select("id, created_at, action, entity_type, entity_id, summary, actor_user_id, actor_role, actor_name, meta")
      .eq("warehouse_id", profile.warehouse_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1); // Fetch one extra to determine if there's more

    // Apply filters
    if (action) {
      if (action.includes("*")) {
        // Prefix match: unit.* -> unit.move, unit.create
        const prefix = action.replace("*", "");
        query = query.like("action", `${prefix}%`);
      } else {
        query = query.eq("action", action);
      }
    }

    if (entityType) {
      query = query.eq("entity_type", entityType);
    }

    if (actor) {
      // Check if actor is UUID or name/role string
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor);
      if (isUUID) {
        query = query.eq("actor_user_id", actor);
      } else {
        // Search by name or role (case-insensitive)
        query = query.or(`actor_name.ilike.%${actor}%,actor_role.ilike.%${actor}%`);
      }
    }

    if (q) {
      // Search in summary and meta (text search)
      query = query.or(`summary.ilike.%${q}%,meta::text.ilike.%${q}%`);
    }

    // Cursor-based pagination
    if (cursor) {
      try {
        const [createdAtStr, idStr] = cursor.split("|");
        const cursorCreatedAt = new Date(createdAtStr);
        const cursorId = idStr;

        // Filter: created_at < cursorCreatedAt OR (created_at = cursorCreatedAt AND id < cursorId)
        // PostgREST doesn't support complex OR conditions well, so we use lt filter which works for our sort order
        // Since we sort by created_at DESC then id DESC, we can use: created_at <= cursorCreatedAt and (created_at < cursorCreatedAt OR id < cursorId)
        // Simplified: filter where timestamp is less or equal, then client-side or use simple lt
        query = query.lt("created_at", cursorCreatedAt.toISOString());
      } catch (e) {
        // Invalid cursor, ignore it
        console.error("Invalid cursor:", cursor, e);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("Audit events query error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Determine next cursor
    const items = data || [];
    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore && resultItems.length > 0
      ? `${resultItems[resultItems.length - 1].created_at}|${resultItems[resultItems.length - 1].id}`
      : null;

    return NextResponse.json({
      ok: true,
      items: resultItems,
      nextCursor,
    });
  } catch (e: any) {
    console.error("Archive list error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
