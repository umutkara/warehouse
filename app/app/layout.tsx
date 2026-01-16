import type { ReactNode } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LeftNav from "./ui/LeftNav";
import TopBarExcel from "./ui/TopBarExcel";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await supabaseServer();

  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, warehouse_id, full_name")
    .eq("id", authData.user.id)
    .single();

  // Если профиль не настроен — возвращаем на логин (или сделаем /pending позже)
  if (!profile?.warehouse_id || !profile?.role) redirect("/login");

  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateRows: "160px 1fr" }}>
      <TopBarExcel />
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", minHeight: 0 }}>
        <LeftNav role={profile.role} />
        <main style={{ background: "#f5f6f7", padding: 16, overflow: "auto" }}>{children}</main>
      </div>
    </div>
  );
}