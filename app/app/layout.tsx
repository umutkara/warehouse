import type { ReactNode } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ConditionalLayout from "./ui/ConditionalLayout";

// Force dynamic rendering - all pages under /app require authentication
export const dynamic = 'force-dynamic';

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
    <ConditionalLayout role={profile.role}>
      {children}
    </ConditionalLayout>
  );
}