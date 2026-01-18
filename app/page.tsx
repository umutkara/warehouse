import { redirect } from "next/navigation";

export default async function RootPage() {
  // Простой редирект на основную страницу
  // Проверка авторизации выполняется в middleware для /app путей
  redirect("/app/warehouse-map");
}
