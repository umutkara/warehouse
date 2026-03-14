import { NextResponse } from "next/server";
import { hasAnyRole } from "@/app/api/_shared/role-access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

type CourierAuthOptions = {
  allowedRoles?: string[];
};

type CourierAuthResult =
  | {
      ok: true;
      user: { id: string };
      profile: { warehouse_id: string; role: string; full_name?: string | null };
    }
  | {
      ok: false;
      response: NextResponse;
    };

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

export async function requireCourierAuth(
  req: Request,
  options: CourierAuthOptions = {},
): Promise<CourierAuthResult> {
  const token = extractBearerToken(req);

  let userId: string | null = null;
  if (token) {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c2b4c4eb-c483-476c-a9b3-e0a1e238982f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'911c50'},body:JSON.stringify({sessionId:'911c50',runId:'run2',hypothesisId:'H6',location:'app/api/courier/_shared/auth.ts:39',message:'bearer token rejected by supabaseAdmin.auth.getUser',data:{error:error?.message||null,tokenLength:token.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    userId = data.user.id;
  } else {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    userId = data.user.id;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("warehouse_id, role, full_name")
    .eq("id", userId)
    .single();

  if (profileError || !profile?.warehouse_id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 }),
    };
  }

  if (options.allowedRoles?.length && !hasAnyRole(profile.role, options.allowedRoles)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    user: { id: userId },
    profile,
  };
}
