import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import {
  canEditRoutePlanning,
  canViewRoutePlanning,
} from "@/lib/routeplanning/access";
import RoutePlanningClient from "../routeplanning-client";

export const dynamic = "force-dynamic";

export default async function RoutePlanningFullscreenPage() {
  const supabase = await supabaseServer();
  let userData: any;
  let userError: any;
  try {
    const authRes = await supabase.auth.getUser();
    userData = authRes.data;
    userError = authRes.error;
  } catch (error) {
    throw error;
  }
  if (userError || !userData?.user) {
    redirect("/login");
  }

  let profile: any;
  let profileError: any;
  try {
    const profileRes = await supabase
      .from("profiles")
      .select("role, warehouse_id")
      .eq("id", userData.user.id)
      .single();
    profile = profileRes.data;
    profileError = profileRes.error;
  } catch (error) {
    throw error;
  }

  if (profileError || !profile?.warehouse_id || !profile.role) {
    redirect("/login");
  }

  if (!canViewRoutePlanning(profile.role)) {
    redirect("/app/warehouse-map");
  }

  return (
    <RoutePlanningClient
      initialRole={profile.role}
      initialCanEdit={canEditRoutePlanning(profile.role)}
      mapsApiKey={
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_JS_API_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
        ""
      }
      variant="fullscreen"
    />
  );
}
