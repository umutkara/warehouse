import { NextResponse } from "next/server";

type RequireUserProfileOptions = {
  profileSelect?: string;
  allowedRoles?: string[];
  forbiddenMessage?: string;
};

type RequireUserProfileResult =
  | {
      ok: true;
      user: any;
      profile: any;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireUserProfile(
  supabase: any,
  options: RequireUserProfileOptions = {},
): Promise<RequireUserProfileResult> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select(options.profileSelect || "warehouse_id, role")
    .eq("id", userData.user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 }),
    };
  }

  if (options.allowedRoles && !options.allowedRoles.includes(profile.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: options.forbiddenMessage || "Forbidden" },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    user: userData.user,
    profile,
  };
}
