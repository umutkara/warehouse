"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/supabase/browser";
import courierLogo from "../icon2.png";

const heroMetrics = [
  { value: "99.9%", label: "Аптайм рабочего контура" },
  { value: "<200мс", label: "Отклик действий ТСД" },
  { value: "24/7", label: "Realtime синхронизация" },
  { value: "∞", label: "Складов в одной системе" },
];

const partners = [
  "Birmarket",
  "Supabase",
  "Next.js",
  "PostgreSQL",
  "Google Play",
  "Android",
  "Flutter",
  "REST API",
  "Realtime",
  "Webhooks",
];

const showcaseSections = [
  {
    side: "left" as const,
    eyebrow: "Аналитика операций",
    title: "Метрики, на которые опирается ежедневный план.",
    text: "Конверсия этапов «создано → выехало → селлер не принял», дневные нарушения, эффективность ТСД и Excel-выгрузка по unit barcode за период — без сборки отчётов руками и без выгрузок в стороннюю BI.",
    bullets: [
      "Drill-down по «не выехало»: на конец периода, выехали позже, дневные нарушения",
      "Селлер не принял с детализацией по партнёру и причине возврата",
      "Excel-экспорт прямо со страницы за выбранный диапазон дат",
    ],
    image: "/screenshot-dashboard.png",
    chip: "warehouse-flow.app/statistics",
  },
  {
    side: "right" as const,
    eyebrow: "Карта склада",
    title: "Каждая ячейка, единица и движение — в живом плане склада.",
    text: "Топологическая карта зон, ячеек и единиц с цветовым статусом. Picking, Stored, Shipping и проблемные позиции видны одним взглядом, без пересчёта по бумажным выгрузкам.",
    bullets: [
      "Цветовая дисциплина: Stored, Picking, Shipping, Empty, Rejected",
      "Боковая панель свежих движений с тип-тегами и временем",
      "Зоны и стеллажи под топологию вашего склада",
    ],
    image: "/screenshot-map.png",
    chip: "warehouse-flow.app/warehouse-map",
  },
];

const capabilityModules = [
  {
    index: "01",
    eyebrow: "Складской контур",
    title: "Полный жизненный цикл единицы на складе",
    text: "WMS управляет приёмкой от поставщика и партнёра, размещением по ячейкам, буфером, инвентаризацией, контролем дублей и излишков. История движения каждой единицы открывается одним кликом.",
    chips: ["Приёмка", "Ячейки", "Буфер", "Инвентаризация", "История движения"],
  },
  {
    index: "02",
    eyebrow: "ТСД и камера телефона",
    title: "Сканирование вместо ручного ввода",
    text: "Штатный ТСД и камера обычного смартфона работают как единый инструмент. Скан подтверждает действие, исключает ручные ошибки и сразу даёт следующий шаг.",
    chips: ["ТСД", "Камера", "Auto-status", "Подсказки", "Без ручного ввода"],
  },
  {
    index: "03",
    eyebrow: "Операционный отдел",
    title: "Исключения внутри процесса, а не сбоку",
    text: "Merchant rejections, проблемные кейсы, SLA и эскалации живут в общем потоке с прозрачным handoff между ролями. Никаких параллельных таблиц и чатов между сменами.",
    chips: ["Merchant rejections", "SLA", "Очереди задач", "Эскалации", "Handoff"],
  },
  {
    index: "04",
    eyebrow: "Маршрутное планирование и OUT",
    title: "Логистика, которая работает на живых данных",
    text: "Формирование рейсов, назначение курьеров и контроль OUT до финального подтверждения вручения. Цифры всегда актуальны — никаких выгрузок «по состоянию на час назад».",
    chips: ["Рейсы", "Назначение", "OUT-контроль", "Realtime", "SLA доставки"],
  },
  {
    index: "05",
    eyebrow: "Мультисклад и переброски",
    title: "Один контур для распределённой сети",
    text: "Несколько складов работают синхронно с общей дисциплиной статусов. Курьерская передача между точками — часть общего движения заказа, а не отдельный процесс на стороне.",
    chips: ["N складов", "Передача между точками", "Общая дисциплина", "Сетевая отчётность"],
  },
  {
    index: "06",
    eyebrow: "Аналитика и контроль",
    title: "Метрики, на которые можно опираться в операциях",
    text: "Конверсия этапов, дневные нарушения, выехало позже, эффективность ТСД-сотрудников и Excel-выгрузка по unit barcode — без выгрузок в стороннюю BI и без ручных отчётов.",
    chips: ["Конверсия", "Дневные нарушения", "Эффективность ТСД", "Excel-экспорт"],
  },
];

const courierFeatures = [
  {
    title: "Маршрут на день",
    text: "Точки доставки и забора, последовательность, прогресс выполнения и ETA — в одном экране без бумажных списков.",
  },
  {
    title: "Подтверждение забора со склада",
    text: "Сканирование штрихкода фиксирует момент передачи. Склад и логистика сразу видят, что заказ у курьера.",
  },
  {
    title: "Перевозка между складами",
    text: "Передача единиц между точками сети — часть общего пути заказа, а не разрозненный процесс на стороне.",
  },
  {
    title: "Доставка с контролем качества",
    text: "Подтверждение вручения, фиксация отказов с причиной, проблемные кейсы автоматически уходят в операционный отдел.",
  },
  {
    title: "Realtime обмен с системой",
    text: "Каждое действие в приложении моментально отражается в WMS, операционном отделе и логистике.",
  },
  {
    title: "Изолированный аккаунт courier",
    text: "Веб-вход для роли courier заблокирован архитектурно — мобильный контур работает только в приложении.",
  },
];

const enterprisePillars = [
  {
    tag: "Reliability",
    title: "Промышленная надёжность",
    text: "Управляемая база, автоматические бэкапы, аудит событий и предсказуемое поведение под нагрузкой круглосуточно.",
  },
  {
    tag: "Security",
    title: "Контроль доступа",
    text: "RLS на уровне базы, разграничение ролей, журналируемые действия и защищённая авторизация.",
  },
  {
    tag: "Scale",
    title: "Готовность к росту",
    text: "Архитектура под мультисклад, распределённые команды и десятки тысяч заказов без переписывания.",
  },
  {
    tag: "Integrations",
    title: "Открытость экосистемы",
    text: "REST API, webhooks, готовность к ERP, маркетплейсам и партнёрским системам доставки.",
  },
];

const processSteps = [
  { step: "01", title: "Приёмка", text: "Приём от поставщика или партнёрского склада" },
  { step: "02", title: "Ячейка", text: "Размещение по складским зонам и буферу" },
  { step: "03", title: "Сборка", text: "Сборка через ТСД или камеру телефона" },
  { step: "04", title: "Операционный отдел", text: "Контроль исключений и SLA" },
  { step: "05", title: "Маршрут", text: "Формирование рейсов и назначение курьеров" },
  { step: "06", title: "Курьер", text: "Забор со склада и движение по точкам" },
  { step: "07", title: "Доставка", text: "Подтверждение вручения и закрытие" },
];

export default function PublicLanding() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [floating, setFloating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "courier_web_denied") {
      setErr("Аккаунт courier доступен только в мобильном приложении.");
    }
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const loginEl = document.getElementById("login");
      const past = window.scrollY > 600;
      const visible = loginEl
        ? loginEl.getBoundingClientRect().top < window.innerHeight - 80
        : false;
      setFloating(past && !visible);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  async function onLogin() {
    setErr(null);
    setLoading(true);
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setErr(error.message);
      return;
    }
    const userId = data.user?.id;
    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.role === "courier") {
        await supabase.auth.signOut();
        setLoading(false);
        setErr("Аккаунт courier доступен только в мобильном приложении.");
        return;
      }
    }
    setLoading(false);
    router.push("/app/receiving");
  }

  return (
    <div className="page" id="top">
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#top" className="brand">
            <span className="brand-mark">W</span>
            <div>
              <strong>Warehouse Flow</strong>
              <small>warehouse · logistics · courier</small>
            </div>
          </a>
          <nav className="nav">
            <a href="#showcase">Продукт</a>
            <a href="#capabilities">Возможности</a>
            <a href="#mobile">Mobile Courier</a>
            <a href="#enterprise">Enterprise</a>
            <a href="#login" className="nav-cta">
              Войти
            </a>
          </nav>
        </div>
      </header>

      <main className="shell">
        {/* HERO */}
        <section className="hero">
          <div className="hero-pill">
            <span className="pulse" />
            Платформа для склада, логистики и доставки
          </div>
          <h1>
            Управляйте всем складом, маршрутами{" "}
            <span className="accent">и курьерами</span> из одного контура.
          </h1>
          <p className="hero-lead">
            Warehouse Flow объединяет WMS, ТСД, операционный отдел, маршрутное планирование,
            мультискладскую передачу и мобильное приложение курьера. Один процесс, одна история
            заказа, одна команда — без рассинхрона между ролями и без ручной склейки данных.
          </p>
          <div className="hero-actions">
            <a href="#login" className="btn primary">
              Войти в систему <span aria-hidden>→</span>
            </a>
            <a href="#showcase" className="btn ghost">
              Посмотреть продукт
            </a>
          </div>

          {/* MacBook + iPhone product shot */}
          <div className="product-shot">
            <div className="macbook">
              <div className="macbook-screen">
                <div className="macbook-bar">
                  <i /><i /><i />
                  <span>warehouse-flow.app/statistics</span>
                </div>
                <div className="macbook-img">
                  <Image
                    src="/screenshot-dashboard.png"
                    alt="Дашборд статистики"
                    fill
                    sizes="(max-width: 1024px) 100vw, 1024px"
                    priority
                    style={{ objectFit: "cover", objectPosition: "top" }}
                  />
                </div>
              </div>
              <div className="macbook-base">
                <div className="macbook-notch" />
              </div>
            </div>

              <div className="iphone">
                <div className="iphone-island" />
                <div className="iphone-screen">
                  <Image
                    src="/screenshot-courier.png"
                    alt="Mobile Courier"
                    fill
                    sizes="260px"
                    style={{ objectFit: "cover", objectPosition: "center" }}
                  />
                </div>
              </div>

            <div className="floating-stat one">
              <span>Realtime</span>
              <strong>Курьер ↔ Склад</strong>
            </div>
            <div className="floating-stat two">
              <span>Аудит</span>
              <strong>каждое действие</strong>
            </div>
          </div>

          {/* trust bar */}
          <div className="hero-trust">
            {heroMetrics.map((m) => (
              <div key={m.label} className="trust-cell">
                <strong>{m.value}</strong>
                <small>{m.label}</small>
              </div>
            ))}
          </div>
        </section>

        {/* PARTNER SPOTLIGHT — Birmarket */}
        <section className="partner-spotlight">
          <div className="partner-card">
            <div className="partner-meta">
              <span className="kicker">Партнёрская интеграция</span>
              <h3>Платформа в ежедневной эксплуатации у Birmarket</h3>
              <p>
                Birmarket — наш производственный партнёр. Реальные операции склада, логистики и
                курьерской доставки идут через Warehouse Flow каждый день, а наш продукт развивается
                на боевой нагрузке, а не на синтетических кейсах.
              </p>
              <div className="partner-tags">
                <span>WMS · ТСД</span>
                <span>Операционный отдел</span>
                <span>Маршрутное планирование</span>
                <span>Mobile Courier</span>
              </div>
            </div>
            <div className="partner-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/birmarket-logo.svg" alt="Birmarket" />
              <small>Производственный партнёр</small>
            </div>
          </div>

          <div className="partners-marquee partners-tech">
            <div className="partners-track">
              {[...partners.filter((p) => p !== "Birmarket"), ...partners.filter((p) => p !== "Birmarket")].map((p, i) => (
                <span key={`${p}-${i}`}>{p}</span>
              ))}
            </div>
          </div>
        </section>

        {/* SHOWCASE — alternating with real screenshots */}
        <section className="showcase" id="showcase">
          {showcaseSections.map((sec, idx) => (
            <article key={sec.title} className={`showcase-row ${sec.side}`}>
              <div className="showcase-copy">
                <span className="kicker">{sec.eyebrow}</span>
                <h2>{sec.title}</h2>
                <p>{sec.text}</p>
                <ul>
                  {sec.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
              <div className="showcase-frame">
                <div className="frame-bar">
                  <i /><i /><i />
                  <span>{sec.chip}</span>
                </div>
                <div className="frame-img">
                  <Image
                    src={sec.image}
                    alt={sec.title}
                    fill
                    sizes="(max-width: 1024px) 100vw, 640px"
                    style={{ objectFit: "cover", objectPosition: "top" }}
                  />
                </div>
                <div className={`frame-glow glow-${idx}`} aria-hidden />
              </div>
            </article>
          ))}
        </section>

        {/* CAPABILITIES — bento grid */}
        <section className="capabilities" id="capabilities">
          <div className="section-head">
            <span className="kicker">Возможности платформы</span>
            <h2>Полная цепочка операций — от приёмки до подтверждения доставки.</h2>
            <p>
              Каждый модуль закрывает свою часть процесса и при этом остаётся частью общей картины.
              Заказ не теряется при переходе между ролями, а руководитель видит, на каком шаге что
              происходит прямо сейчас.
            </p>
          </div>

          <div className="modules-list">
            {capabilityModules.map((mod) => (
              <article key={mod.index} className="module-row">
                <div className="module-num">
                  <span>{mod.index}</span>
                  <i />
                </div>
                <div className="module-body">
                  <span className="kicker small">{mod.eyebrow}</span>
                  <h3>{mod.title}</h3>
                  <p>{mod.text}</p>
                  <div className="module-chips">
                    {mod.chips.map((chip) => (
                      <span key={chip} className="chip">{chip}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* MOBILE COURIER — full bleed dark */}
        <section className="mobile" id="mobile">
          <div className="mobile-grid">
            <div className="mobile-copy">
              <div className="mobile-app-badge">
                <Image src={courierLogo} alt="Mobile Courier" width={64} height={64} />
                <div>
                  <span className="kicker accent">Mobile Courier · Android</span>
                  <strong>Отдельное приложение в Google Play</strong>
                </div>
              </div>
              <h2>Курьер видит весь маршрут — а склад и логистика видят курьера в реальном времени.</h2>
              <p>
                Mobile Courier закрывает мобильную часть операций: забор со склада, перевозку
                между складами, доставку клиенту, фиксацию отказов и проблемных кейсов. Каждое
                действие моментально возвращается в операционный контур.
              </p>

              <div className="play-row">
                <div className="play-badge">
                  <span className="play-icon">▶</span>
                  <span>
                    <small>Доступно в</small>
                    <b>Google Play</b>
                  </span>
                </div>
                <p className="play-note">
                  Установка через Google Play, обновления приходят автоматически. Веб-вход для
                  аккаунта courier заблокирован — мобильный контур изолирован.
                </p>
              </div>

              <div className="mobile-features">
                {courierFeatures.map((f) => (
                  <div key={f.title} className="mobile-feature">
                    <span className="dot" />
                    <div>
                      <strong>{f.title}</strong>
                      <p>{f.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mobile-stage">
              <div className="iphone big">
                <div className="iphone-island" />
                <div className="iphone-screen">
                  <Image
                    src="/screenshot-courier.png"
                    alt="Mobile Courier — экран маршрута"
                    fill
                    sizes="320px"
                    style={{ objectFit: "cover", objectPosition: "center" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ENTERPRISE — dark contrast */}
        <section className="enterprise" id="enterprise">
          <div className="section-head dark">
            <span className="kicker accent">Enterprise · готовность</span>
            <h2>Промышленная надёжность как часть архитектуры, а не как опция.</h2>
            <p>
              Мы строили платформу под промышленную эксплуатацию: круглосуточные операции,
              распределённые команды и непрерывный поток заказов. Поэтому надёжность, безопасность
              и масштабирование зашиты в продукт.
            </p>
          </div>
          <div className="ent-grid">
            {enterprisePillars.map((p) => (
              <article key={p.title} className="ent-card">
                <span className="ent-tag">{p.tag}</span>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* PROCESS */}
        <section className="process">
          <div className="section-head">
            <span className="kicker">Единая цепочка статусов</span>
            <h2>Заказ всегда находится на конкретном шаге — без серых зон.</h2>
          </div>
          <ol className="process-list">
            {processSteps.map((s) => (
              <li key={s.step}>
                <span className="process-step">{s.step}</span>
                <strong>{s.title}</strong>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* CTA + LOGIN */}
        <section className="cta" id="login">
          <div className="cta-grid">
            <div className="cta-copy">
              <span className="kicker">Доступ к платформе</span>
              <h2>Войдите в рабочий контур склада, логистики и доставки.</h2>
              <p>
                После авторизации команда сразу попадает в операционные разделы по своей роли:
                склад и ТСД, операционный отдел, маршруты и OUT, статистика и SLA. Каждое действие
                остаётся частью общей истории заказа.
              </p>
              <ul className="cta-bullets">
                <li>Защищённый вход с аудитом действий</li>
                <li>Разграничение по ролям и складам</li>
                <li>Realtime обновления операционных метрик</li>
              </ul>
            </div>

            <div className="login-card">
              <div className="login-badge">
                <span className="login-dot" />
                Защищённый вход · аудит действий
              </div>
              <h3>Авторизация</h3>
              <p className="login-sub">Для склада, логистики, руководителей и операторов системы.</p>

              <label>
                Email
                <input
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loading) onLogin();
                  }}
                />
              </label>
              <label>
                Пароль
                <input
                  placeholder="••••••••"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loading) onLogin();
                  }}
                />
              </label>

              {err && (
                <div className="error">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <circle cx="8" cy="8" r="8" fill="#ef4444" opacity="0.16" />
                    <path d="M8 4v4M8 10h.01" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  {err}
                </div>
              )}

              <button onClick={onLogin} disabled={loading} className="submit">
                {loading ? (
                  <span className="loading">
                    <span className="spinner" />
                    Вход...
                  </span>
                ) : (
                  "Войти в систему"
                )}
              </button>
              <p className="login-foot">
                Доступ для команды настраивает администратор организации — роли назначаются
                централизованно.
              </p>
            </div>
          </div>
        </section>

        <footer className="site-footer">
          <div className="footer-brand">
            <span className="brand-mark">W</span>
            <div>
              <strong>Warehouse Flow</strong>
              <small>warehouse · logistics · courier platform</small>
            </div>
          </div>
          <div className="footer-cols">
            <div>
              <p>Платформа</p>
              <a href="#showcase">Продукт</a>
              <a href="#capabilities">Возможности</a>
              <a href="#process">Цепочка статусов</a>
            </div>
            <div>
              <p>Mobile Courier</p>
              <a href="#mobile">Возможности</a>
              <a href="#mobile">Доступ через Google Play</a>
            </div>
            <div>
              <p>Enterprise</p>
              <a href="#enterprise">Reliability · Security</a>
              <a href="#enterprise">Scale · Integrations</a>
            </div>
            <div>
              <p>Доступ</p>
              <a href="#login">Войти в систему</a>
              <span className="footer-meta">© {new Date().getFullYear()} Warehouse Flow</span>
            </div>
          </div>
        </footer>
      </main>

      <a
        href="#login"
        className={`float-cta ${floating ? "is-visible" : ""}`}
        aria-hidden={!floating}
        tabIndex={floating ? 0 : -1}
      >
        Войти в систему
      </a>

      <style jsx>{`
        :global(html) { scroll-behavior: smooth; }
        :global(body) { background: #f6f5f0; }

        .page {
          min-height: 100vh;
          color: #0a0e1a;
          background:
            radial-gradient(900px 500px at 80% -10%, rgba(255, 87, 34, 0.08), transparent 70%),
            radial-gradient(700px 400px at -10% 30%, rgba(29, 78, 216, 0.06), transparent 70%),
            #f6f5f0;
        }

        /* ---------- topbar ---------- */
        .topbar {
          position: sticky;
          top: 0;
          z-index: 60;
          background: rgba(246, 245, 240, 0.78);
          backdrop-filter: saturate(180%) blur(18px);
          -webkit-backdrop-filter: saturate(180%) blur(18px);
          border-bottom: 1px solid rgba(10, 14, 26, 0.06);
        }
        .topbar-inner {
          max-width: 1280px;
          margin: 0 auto;
          padding: 12px 22px;
          min-height: 60px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
          color: inherit;
        }
        .brand-mark {
          width: 38px;
          height: 38px;
          border-radius: 11px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #0a0e1a;
          color: #fff;
          font-weight: 900;
          font-size: 17px;
          letter-spacing: -0.04em;
          box-shadow: 0 6px 18px rgba(10, 14, 26, 0.18);
        }
        .brand strong {
          display: block;
          font-size: 15px;
          letter-spacing: -0.01em;
          color: #0a0e1a;
        }
        .brand small {
          display: block;
          margin-top: 2px;
          font-size: 11px;
          color: #6b7280;
          letter-spacing: 0.04em;
        }
        .nav {
          display: flex;
          gap: 22px;
          align-items: center;
          flex-wrap: wrap;
        }
        .nav a {
          color: #4b5563;
          text-decoration: none;
          font-size: 13px;
          font-weight: 700;
          transition: color 0.18s ease;
        }
        .nav a:hover { color: #0a0e1a; }
        .nav-cta {
          background: #0a0e1a;
          color: #fff !important;
          padding: 9px 18px;
          border-radius: 999px;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }
        .nav-cta:hover {
          transform: translateY(-1px);
          box-shadow: 0 12px 24px rgba(10, 14, 26, 0.24);
        }

        .shell {
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 22px;
        }

        /* ---------- hero ---------- */
        .hero {
          padding: 80px 0 60px;
          text-align: center;
          position: relative;
        }
        .hero-pill {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 7px 14px;
          border-radius: 999px;
          background: rgba(10, 14, 26, 0.04);
          border: 1px solid rgba(10, 14, 26, 0.08);
          color: #4b5563;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.02em;
          margin-bottom: 26px;
        }
        .pulse {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ff5722;
          box-shadow: 0 0 0 4px rgba(255, 87, 34, 0.18);
          animation: pulse 1.6s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(255, 87, 34, 0.18); }
          50% { box-shadow: 0 0 0 8px rgba(255, 87, 34, 0.06); }
        }
        h1 {
          margin: 0 auto;
          max-width: 980px;
          font-size: clamp(40px, 5.4vw, 78px);
          line-height: 1.02;
          letter-spacing: -0.045em;
          font-weight: 800;
          color: #0a0e1a;
        }
        h1 .accent {
          background: linear-gradient(135deg, #ff5722 0%, #f59e0b 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .hero-lead {
          margin: 24px auto 0;
          max-width: 760px;
          color: #4b5563;
          font-size: 18px;
          line-height: 1.65;
        }
        .hero-actions {
          margin: 32px 0 0;
          display: inline-flex;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-height: 50px;
          padding: 0 22px;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 800;
          text-decoration: none;
          transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
          border: 1px solid transparent;
        }
        .btn.primary {
          background: #0a0e1a;
          color: #fff;
          box-shadow: 0 16px 36px rgba(10, 14, 26, 0.24);
        }
        .btn.primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 22px 44px rgba(10, 14, 26, 0.3);
        }
        .btn.ghost {
          background: rgba(255, 255, 255, 0.7);
          border-color: rgba(10, 14, 26, 0.12);
          color: #0a0e1a;
        }
        .btn.ghost:hover { background: #fff; }

        /* ---------- product shot (MacBook + iPhone) ---------- */
        .product-shot {
          position: relative;
          margin: 64px auto 0;
          max-width: 1100px;
          padding-bottom: 70px;
        }
        .macbook {
          position: relative;
          margin: 0 auto;
          max-width: 980px;
        }
        .macbook-screen {
          position: relative;
          aspect-ratio: 16 / 10;
          border-radius: 18px 18px 6px 6px;
          background: #0a0e1a;
          padding: 12px 14px 14px;
          box-shadow:
            0 50px 120px rgba(10, 14, 26, 0.32),
            0 0 0 2px #0a0e1a,
            0 0 0 4px #1f2937;
          overflow: hidden;
        }
        .macbook-bar {
          height: 22px;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0 4px 8px;
        }
        .macbook-bar i {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #4b5563;
        }
        .macbook-bar i:nth-child(1) { background: #ef4444; }
        .macbook-bar i:nth-child(2) { background: #f59e0b; }
        .macbook-bar i:nth-child(3) { background: #10b981; }
        .macbook-bar span {
          margin-left: auto;
          margin-right: auto;
          color: #9ca3af;
          font-size: 11px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          padding: 3px 12px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 999px;
        }
        .macbook-img {
          position: relative;
          width: 100%;
          height: calc(100% - 30px);
          border-radius: 6px;
          overflow: hidden;
          background: #fff;
        }
        .macbook-base {
          height: 16px;
          margin: 0 auto;
          width: 110%;
          max-width: 1080px;
          background: linear-gradient(180deg, #d1d5db 0%, #9ca3af 60%, #6b7280 100%);
          border-radius: 0 0 24px 24px / 0 0 14px 14px;
          position: relative;
          margin-top: -2px;
          box-shadow: 0 24px 50px rgba(10, 14, 26, 0.18);
        }
        .macbook-notch {
          position: absolute;
          left: 50%;
          top: 0;
          transform: translateX(-50%);
          width: 110px;
          height: 6px;
          background: #6b7280;
          border-radius: 0 0 8px 8px;
        }

        .iphone {
          position: absolute;
          right: -10px;
          bottom: -20px;
          width: 200px;
          aspect-ratio: 9 / 19.5;
          border-radius: 36px;
          padding: 8px;
          background: linear-gradient(160deg, #2a303a, #050810 60%, #2a303a);
          border: 1px solid rgba(255, 255, 255, 0.16);
          box-shadow: 0 30px 70px rgba(10, 14, 26, 0.4);
          transform: rotate(4deg);
          z-index: 3;
        }
        .iphone.big {
          position: relative;
          right: auto;
          bottom: auto;
          width: 280px;
          margin: 0 auto;
          transform: rotate(0);
        }
        .iphone-island {
          position: absolute;
          top: 14px;
          left: 50%;
          transform: translateX(-50%);
          width: 70px;
          height: 20px;
          border-radius: 999px;
          background: #02040a;
          z-index: 4;
        }
        .iphone-screen {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 28px;
          overflow: hidden;
          background: #fff;
        }

        .floating-stat {
          position: absolute;
          z-index: 4;
          display: grid;
          gap: 2px;
          padding: 12px 14px;
          background: #fff;
          border-radius: 14px;
          border: 1px solid rgba(10, 14, 26, 0.08);
          box-shadow: 0 16px 30px rgba(10, 14, 26, 0.12);
        }
        .floating-stat span {
          font-size: 10px;
          color: #ff5722;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .floating-stat strong {
          font-size: 14px;
          color: #0a0e1a;
          letter-spacing: -0.01em;
        }
        .floating-stat.one {
          left: -10px;
          top: 24%;
          transform: rotate(-3deg);
        }
        .floating-stat.two {
          left: 8%;
          bottom: 60px;
          transform: rotate(2deg);
        }

        .hero-trust {
          margin: 60px auto 0;
          max-width: 980px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          background: #fff;
          border: 1px solid rgba(10, 14, 26, 0.08);
          border-radius: 18px;
          box-shadow: 0 16px 36px rgba(10, 14, 26, 0.06);
          overflow: hidden;
        }
        .trust-cell {
          padding: 18px 20px;
          text-align: left;
          border-right: 1px solid rgba(10, 14, 26, 0.06);
          display: grid;
          gap: 4px;
        }
        .trust-cell:last-child { border-right: none; }
        .trust-cell strong {
          font-size: 24px;
          letter-spacing: -0.03em;
          color: #0a0e1a;
        }
        .trust-cell small {
          color: #6b7280;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.4;
        }

        /* ---------- partner spotlight ---------- */
        .partner-spotlight {
          padding: 56px 0 32px;
          border-top: 1px solid rgba(10, 14, 26, 0.06);
        }
        .partner-card {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.6fr);
          gap: 32px;
          padding: 36px;
          background: linear-gradient(135deg, #ffffff 0%, #fff7f1 100%);
          border: 1px solid rgba(255, 87, 34, 0.18);
          border-radius: 24px;
          box-shadow: 0 24px 50px rgba(255, 87, 34, 0.08);
          align-items: center;
        }
        .partner-meta h3 {
          margin: 12px 0 0;
          font-size: clamp(24px, 2.6vw, 34px);
          line-height: 1.12;
          letter-spacing: -0.03em;
          color: #0a0e1a;
          font-weight: 800;
        }
        .partner-meta p {
          margin: 14px 0 0;
          color: #4b5563;
          font-size: 15px;
          line-height: 1.65;
          max-width: 600px;
        }
        .partner-tags {
          margin-top: 18px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .partner-tags span {
          display: inline-flex;
          align-items: center;
          padding: 5px 12px;
          border-radius: 999px;
          background: #fff;
          border: 1px solid rgba(10, 14, 26, 0.1);
          color: #1f2937;
          font-size: 12px;
          font-weight: 700;
        }
        .partner-logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 28px 22px;
          background: #fff;
          border: 1px solid rgba(10, 14, 26, 0.08);
          border-radius: 18px;
          box-shadow: 0 12px 28px rgba(10, 14, 26, 0.06);
        }
        .partner-logo img {
          height: 44px;
          width: auto;
          max-width: 100%;
        }
        .partner-logo small {
          color: #6b7280;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        /* ---------- partners marquee (tech) ---------- */
        .partners-tech {
          margin-top: 32px;
        }
        .partners-marquee {
          overflow: hidden;
          mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent);
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent);
        }
        .partners-track {
          display: inline-flex;
          gap: 44px;
          padding: 6px 0;
          animation: marquee 38s linear infinite;
          white-space: nowrap;
        }
        .partners-track span {
          color: #4b5563;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -0.01em;
          opacity: 0.55;
          transition: opacity 0.2s ease, color 0.2s ease;
          flex: none;
        }
        .partners-track span:hover {
          opacity: 1;
          color: #0a0e1a;
        }
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }

        /* ---------- showcase ---------- */
        .showcase {
          padding: 100px 0 80px;
          display: grid;
          gap: 100px;
        }
        .showcase-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
          gap: 56px;
          align-items: center;
        }
        .showcase-row.right {
          grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
        }
        .showcase-row.right .showcase-copy { order: 2; }
        .showcase-row.right .showcase-frame { order: 1; }

        .showcase-copy h2 {
          margin: 14px 0 0;
          font-size: clamp(28px, 3.4vw, 44px);
          line-height: 1.08;
          letter-spacing: -0.035em;
          color: #0a0e1a;
        }
        .showcase-copy p {
          margin: 16px 0 0;
          color: #4b5563;
          font-size: 16px;
          line-height: 1.7;
        }
        .showcase-copy ul {
          margin: 22px 0 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 10px;
        }
        .showcase-copy li {
          padding-left: 26px;
          position: relative;
          color: #1f2937;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.55;
        }
        .showcase-copy li::before {
          content: "";
          position: absolute;
          left: 0;
          top: 6px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ff5722, #f59e0b);
        }
        .showcase-copy li::after {
          content: "";
          position: absolute;
          left: 4px;
          top: 10px;
          width: 6px;
          height: 3px;
          border-left: 1.5px solid #fff;
          border-bottom: 1.5px solid #fff;
          transform: rotate(-45deg);
        }

        .showcase-frame {
          position: relative;
        }
        .frame-glow {
          position: absolute;
          inset: -28px;
          z-index: 0;
          filter: blur(40px);
          opacity: 0.6;
          pointer-events: none;
        }
        .glow-0 { background: radial-gradient(circle at 70% 30%, rgba(255, 87, 34, 0.4), transparent 60%); }
        .glow-1 { background: radial-gradient(circle at 30% 70%, rgba(29, 78, 216, 0.32), transparent 60%); }

        .frame-bar {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 14px;
          background: #f3f4f6;
          border: 1px solid rgba(10, 14, 26, 0.08);
          border-bottom: none;
          border-radius: 14px 14px 0 0;
        }
        .frame-bar i {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #d1d5db;
        }
        .frame-bar i:nth-child(1) { background: #ef4444; }
        .frame-bar i:nth-child(2) { background: #f59e0b; }
        .frame-bar i:nth-child(3) { background: #10b981; }
        .frame-bar span {
          margin-left: auto;
          margin-right: auto;
          padding: 3px 14px;
          background: #fff;
          border: 1px solid rgba(10, 14, 26, 0.08);
          border-radius: 999px;
          color: #6b7280;
          font-size: 11px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .frame-img {
          position: relative;
          z-index: 1;
          aspect-ratio: 16 / 10;
          border: 1px solid rgba(10, 14, 26, 0.08);
          border-top: none;
          border-radius: 0 0 14px 14px;
          overflow: hidden;
          background: #fff;
          box-shadow: 0 28px 60px rgba(10, 14, 26, 0.16);
        }

        /* ---------- capabilities (bento) ---------- */
        .capabilities {
          padding: 100px 0;
          border-top: 1px solid rgba(10, 14, 26, 0.06);
        }
        .section-head { max-width: 880px; }
        .kicker {
          display: inline-block;
          color: #ff5722;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .kicker.small { font-size: 11px; letter-spacing: 0.12em; }
        .kicker.accent { color: #fcd34d; }
        .section-head h2 {
          margin: 14px 0 0;
          font-size: clamp(30px, 3.6vw, 50px);
          line-height: 1.05;
          letter-spacing: -0.04em;
          color: #0a0e1a;
          font-weight: 800;
        }
        .section-head p {
          margin: 16px 0 0;
          color: #4b5563;
          font-size: 16px;
          line-height: 1.7;
          max-width: 740px;
        }
        .section-head.dark h2 { color: #fff; }
        .section-head.dark p { color: #aab4c5; }

        .modules-list {
          margin-top: 56px;
          display: grid;
          gap: 0;
          border-top: 1px solid rgba(10, 14, 26, 0.1);
        }
        .module-row {
          display: grid;
          grid-template-columns: 96px minmax(0, 1fr);
          gap: 32px;
          padding: 32px 0;
          border-bottom: 1px solid rgba(10, 14, 26, 0.1);
          transition: background 0.2s ease;
          position: relative;
        }
        .module-row:hover {
          background: rgba(255, 87, 34, 0.025);
        }
        .module-row::before {
          content: "";
          position: absolute;
          left: -22px;
          right: -22px;
          top: -1px;
          height: 1px;
          background: transparent;
          transition: background 0.2s ease;
        }
        .module-num {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
          padding-top: 4px;
        }
        .module-num span {
          font-size: 36px;
          font-weight: 800;
          letter-spacing: -0.04em;
          color: #0a0e1a;
          line-height: 1;
          font-feature-settings: "tnum";
        }
        .module-num i {
          width: 28px;
          height: 3px;
          border-radius: 999px;
          background: linear-gradient(90deg, #ff5722, #f59e0b);
        }
        .module-body h3 {
          margin: 6px 0 0;
          font-size: clamp(22px, 2.4vw, 30px);
          letter-spacing: -0.025em;
          color: #0a0e1a;
          line-height: 1.18;
          font-weight: 800;
          max-width: 760px;
        }
        .module-body p {
          margin: 12px 0 0;
          color: #4b5563;
          font-size: 15px;
          line-height: 1.65;
          max-width: 720px;
        }
        .module-chips {
          margin-top: 18px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .chip {
          display: inline-flex;
          align-items: center;
          padding: 6px 12px;
          border-radius: 999px;
          background: #fff;
          border: 1px solid rgba(10, 14, 26, 0.1);
          color: #1f2937;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: -0.005em;
          transition: border-color 0.18s ease, color 0.18s ease;
        }
        .module-row:hover .chip {
          border-color: rgba(255, 87, 34, 0.4);
          color: #0a0e1a;
        }

        /* ---------- mobile section ---------- */
        .mobile {
          margin: 60px 0;
          padding: 80px 36px;
          border-radius: 32px;
          background:
            radial-gradient(60% 50% at 80% 0%, rgba(255, 87, 34, 0.18), transparent 70%),
            radial-gradient(50% 60% at 0% 100%, rgba(29, 78, 216, 0.16), transparent 70%),
            #0a0e1a;
          color: #e5e7eb;
        }
        .mobile-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.7fr);
          gap: 56px;
          align-items: center;
        }
        .mobile-app-badge {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 22px;
        }
        .mobile-app-badge :global(img) {
          border-radius: 16px;
          box-shadow: 0 16px 30px rgba(0, 0, 0, 0.42);
        }
        .mobile-app-badge strong {
          display: block;
          margin-top: 4px;
          color: #fff;
          font-size: 16px;
          letter-spacing: -0.01em;
        }
        .mobile h2 {
          margin: 0;
          font-size: clamp(28px, 3.4vw, 44px);
          line-height: 1.1;
          letter-spacing: -0.035em;
          color: #fff;
        }
        .mobile-copy > p {
          margin: 18px 0 0;
          color: #aab4c5;
          font-size: 16px;
          line-height: 1.7;
        }
        .play-row {
          margin-top: 26px;
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .play-badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.14);
        }
        .play-icon {
          width: 30px;
          height: 30px;
          border-radius: 10px;
          background: #34a853;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 13px;
        }
        .play-badge small {
          display: block;
          color: #9ca3af;
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .play-badge b {
          display: block;
          color: #fff;
          font-size: 14px;
          font-weight: 900;
          margin-top: 2px;
        }
        .play-note {
          margin: 0;
          max-width: 320px;
          color: #9ca3af;
          font-size: 13px;
          line-height: 1.55;
        }
        .mobile-features {
          margin-top: 36px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0 28px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        .mobile-feature {
          display: grid;
          grid-template-columns: 22px 1fr;
          gap: 12px;
          padding: 18px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          align-items: start;
        }
        .mobile-feature .dot {
          margin-top: 7px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ff5722;
          box-shadow: 0 0 0 5px rgba(255, 87, 34, 0.18);
        }
        .mobile-feature strong {
          display: block;
          color: #fff;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: -0.01em;
        }
        .mobile-feature p {
          margin: 6px 0 0;
          color: #aab4c5;
          font-size: 13px;
          line-height: 1.55;
        }
        .mobile-stage {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* ---------- enterprise ---------- */
        .enterprise {
          padding: 100px 0;
          border-top: 1px solid rgba(10, 14, 26, 0.06);
          background: #0a0e1a;
          color: #fff;
          margin: 0 -22px;
          padding-left: 22px;
          padding-right: 22px;
        }
        .enterprise .section-head { margin: 0 auto; max-width: 1280px; padding: 0 0; }
        .ent-grid {
          margin: 44px auto 0;
          max-width: 1280px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }
        .ent-card {
          padding: 24px;
          border-radius: 22px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          transition: transform 0.2s ease, border-color 0.2s ease;
        }
        .ent-card:hover {
          transform: translateY(-3px);
          border-color: rgba(255, 87, 34, 0.4);
        }
        .ent-tag {
          display: inline-flex;
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(255, 87, 34, 0.16);
          color: #fcd34d;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .ent-card h3 {
          margin: 14px 0 8px;
          font-size: 18px;
          color: #fff;
          letter-spacing: -0.01em;
        }
        .ent-card p {
          margin: 0;
          color: #aab4c5;
          font-size: 13px;
          line-height: 1.6;
        }

        /* ---------- process ---------- */
        .process {
          padding: 100px 0 80px;
          border-top: 1px solid rgba(10, 14, 26, 0.06);
        }
        .process-list {
          margin: 44px 0 0;
          padding: 0;
          list-style: none;
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          border-top: 1px solid rgba(10, 14, 26, 0.12);
        }
        .process-list li {
          padding: 22px 16px 0 0;
          border-right: 1px solid rgba(10, 14, 26, 0.08);
        }
        .process-list li:last-child { border-right: none; }
        .process-step {
          color: #ff5722;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
        }
        .process-list strong {
          display: block;
          margin-top: 10px;
          color: #0a0e1a;
          font-size: 16px;
          letter-spacing: -0.01em;
        }
        .process-list p {
          margin: 8px 0 0;
          color: #6b7280;
          font-size: 12px;
          line-height: 1.55;
        }

        /* ---------- cta + login ---------- */
        .cta {
          padding: 100px 0;
          border-top: 1px solid rgba(10, 14, 26, 0.06);
        }
        .cta-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.95fr);
          gap: 48px;
          align-items: start;
        }
        .cta-copy h2 {
          margin: 14px 0 0;
          font-size: clamp(28px, 3.4vw, 44px);
          line-height: 1.1;
          letter-spacing: -0.035em;
          color: #0a0e1a;
        }
        .cta-copy p {
          margin: 18px 0 0;
          color: #4b5563;
          font-size: 16px;
          line-height: 1.7;
          max-width: 560px;
        }
        .cta-bullets {
          margin: 22px 0 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 10px;
        }
        .cta-bullets li {
          padding-left: 24px;
          position: relative;
          color: #1f2937;
          font-size: 14px;
          font-weight: 700;
        }
        .cta-bullets li::before {
          content: "";
          position: absolute;
          left: 0;
          top: 6px;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: linear-gradient(135deg, #34a853, #10b981);
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.16);
        }

        .login-card {
          padding: 26px;
          border-radius: 24px;
          background: #fff;
          border: 1px solid rgba(10, 14, 26, 0.08);
          box-shadow: 0 28px 60px rgba(10, 14, 26, 0.1);
          display: grid;
          gap: 14px;
        }
        .login-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 11px;
          border-radius: 999px;
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.32);
          color: #047857;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          width: fit-content;
        }
        .login-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.18);
        }
        .login-card h3 {
          margin: 0;
          font-size: 22px;
          color: #0a0e1a;
          letter-spacing: -0.02em;
        }
        .login-sub {
          margin: 0;
          color: #6b7280;
          font-size: 14px;
          line-height: 1.55;
        }
        .login-card label {
          display: grid;
          gap: 6px;
          color: #1f2937;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.02em;
        }
        .login-card input {
          width: 100%;
          box-sizing: border-box;
          border-radius: 14px;
          border: 1px solid rgba(10, 14, 26, 0.12);
          background: #fafaf7;
          color: #0a0e1a;
          padding: 13px 14px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }
        .login-card input::placeholder { color: #9ca3af; }
        .login-card input:focus {
          border-color: #ff5722;
          box-shadow: 0 0 0 3px rgba(255, 87, 34, 0.16);
          background: #fff;
        }
        .submit {
          width: 100%;
          border: none;
          border-radius: 14px;
          padding: 14px 16px;
          background: #0a0e1a;
          color: #fff;
          font-size: 15px;
          font-weight: 900;
          cursor: pointer;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }
        .submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 16px 30px rgba(10, 14, 26, 0.28);
        }
        .submit:disabled { opacity: 0.7; cursor: not-allowed; }
        .login-foot {
          margin: 0;
          color: #6b7280;
          font-size: 12px;
          line-height: 1.55;
        }
        .error {
          border-radius: 12px;
          border: 1px solid rgba(239, 68, 68, 0.3);
          background: rgba(239, 68, 68, 0.08);
          color: #b42318;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }
        .loading { display: inline-flex; align-items: center; gap: 8px; }
        .spinner {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ---------- footer ---------- */
        .site-footer {
          padding: 48px 0 32px;
          border-top: 1px solid rgba(10, 14, 26, 0.06);
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 2fr);
          gap: 32px;
        }
        .footer-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .footer-cols {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 22px;
        }
        .footer-cols div {
          display: grid;
          gap: 8px;
          align-content: start;
        }
        .footer-cols p {
          margin: 0 0 4px;
          color: #6b7280;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .footer-cols a {
          color: #1f2937;
          text-decoration: none;
          font-size: 13px;
          font-weight: 700;
          transition: color 0.18s ease;
        }
        .footer-cols a:hover { color: #ff5722; }
        .footer-meta {
          margin-top: 8px;
          color: #9ca3af;
          font-size: 12px;
        }

        /* ---------- floating cta ---------- */
        .float-cta {
          position: fixed;
          right: 22px;
          bottom: 22px;
          z-index: 70;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 14px 22px;
          border-radius: 999px;
          background: #0a0e1a;
          color: #fff;
          text-decoration: none;
          font-size: 14px;
          font-weight: 900;
          box-shadow: 0 22px 40px rgba(10, 14, 26, 0.32);
          opacity: 0;
          pointer-events: none;
          transform: translateY(14px);
          transition: opacity 0.25s ease, transform 0.25s ease, box-shadow 0.2s ease;
        }
        .float-cta.is-visible {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }
        .float-cta:hover {
          box-shadow: 0 26px 46px rgba(10, 14, 26, 0.4);
          transform: translateY(-2px);
        }

        /* ---------- responsive ---------- */
        @media (max-width: 1100px) {
          .showcase-row,
          .showcase-row.right,
          .mobile-grid,
          .cta-grid,
          .site-footer {
            grid-template-columns: 1fr;
          }
          .showcase-row.right .showcase-copy { order: 1; }
          .showcase-row.right .showcase-frame { order: 2; }
          .partner-card {
            grid-template-columns: 1fr;
            padding: 26px;
          }
          .ent-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .footer-cols {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .process-list {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
          .iphone {
            right: -4px;
            width: 160px;
          }
          .floating-stat { display: none; }
        }
        @media (max-width: 720px) {
          .topbar-inner {
            padding: 10px 14px;
            flex-direction: column;
            align-items: flex-start;
          }
          .nav { gap: 14px; }
          .shell { padding: 0 14px; }
          .hero { padding: 56px 0 40px; }
          .hero-trust {
            grid-template-columns: 1fr 1fr;
          }
          .trust-cell:nth-child(odd) { border-right: 1px solid rgba(10, 14, 26, 0.06); }
          .trust-cell:nth-child(2n) { border-right: none; }
          .trust-cell:nth-child(1),
          .trust-cell:nth-child(2) { border-bottom: 1px solid rgba(10, 14, 26, 0.06); }
          .ent-grid,
          .footer-cols,
          .mobile-features {
            grid-template-columns: 1fr;
          }
          .module-row {
            grid-template-columns: 1fr;
            gap: 8px;
            padding: 24px 0;
          }
          .module-num span { font-size: 28px; }
          .process-list { grid-template-columns: 1fr; }
          .process-list li {
            border-right: none;
            border-bottom: 1px solid rgba(10, 14, 26, 0.08);
            padding: 16px 0;
          }
          .process-list li:last-child { border-bottom: none; }
          .iphone { width: 140px; right: 0; }
          .mobile {
            padding: 56px 22px;
            margin: 32px 0;
          }
          .enterprise { margin: 0 -14px; padding-left: 14px; padding-right: 14px; }
        }
      `}</style>
    </div>
  );
}
