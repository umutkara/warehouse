import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          res.cookies.set(name, value, options);
        },
        remove(name: string, options: any) {
          res.cookies.set(name, "", { ...options, maxAge: 0 });
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;
  const isLoggedIn = !!user;

  const pathname = req.nextUrl.pathname;

  // Разрешаем публичное
  if (pathname.startsWith("/login")) return res;

  // Защита /app
  if (pathname.startsWith("/app")) {
    if (!isLoggedIn) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    // Courier-аккаунты работают только в мобильном приложении.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role === "courier") {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "courier_web_denied");
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ["/app/:path*", "/login"],
};
