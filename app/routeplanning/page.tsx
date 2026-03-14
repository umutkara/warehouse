import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import {
  canEditRoutePlanning,
  canViewRoutePlanning,
} from "@/lib/routeplanning/access";
import RoutePlanningClient from "./routeplanning-client";

export const dynamic = "force-dynamic";

export default async function RoutePlanningPage() {
  const supabase = await supabaseServer();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, warehouse_id")
    .eq("id", userData.user.id)
    .single();

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
      mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_JS_API_KEY || ""}
    />
  );
}
