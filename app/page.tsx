import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const supabase = await supabaseServer();
  
  // Проверка авторизации
  const { data: authData } = await supabase.auth.getUser();
  
  if (!authData?.user) {
    // Если не авторизован - редирект на страницу логина
    redirect("/login");
  }

  // Если авторизован - редирект на основную страницу приложения
  redirect("/app/warehouse-map");
}
