import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Warehouse Flow — операционная платформа склада, логистики и доставки",
  description:
    "WMS, ТСД, операционный отдел, маршрутное планирование, мультисклад и мобильный курьер в одном промышленном контуре. Прозрачная цепочка статусов, аудит каждого действия, готовность к Enterprise-нагрузке.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="UTF-8" />
        <meta httpEquiv="Content-Language" content="ru" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}