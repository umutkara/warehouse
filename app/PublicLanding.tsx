"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/supabase/browser";
import courierLogo from "../icon2.png";

const footprint = [
  "WMS",
  "TSD",
  "операционный отдел",
  "маршрутное планирование",
  "мультисклад",
  "мобильный курьер",
];

const productSections = [
  {
    index: "01",
    title: "Складской контур",
    text: "Приемка, размещение по ячейкам, буфер, инвентаризация, излишки, дубли и история движения каждого заказа.",
    details: "Система показывает, где находится заказ, кто последним работал с ним и какой следующий шаг должен выполнить склад.",
  },
  {
    index: "02",
    title: "ТСД и мобильное сканирование",
    text: "Работа со сканером и камерой телефона: приемка, поиск заказа, подтверждение ячейки, сборка и передача дальше по процессу.",
    details: "Оператор не переписывает штрихкоды руками, а закрывает действия сканом и получает подсказку по текущему статусу.",
  },
  {
    index: "03",
    title: "Операционный отдел",
    text: "Создание заданий, контроль исключений, merchant rejections, подготовка к отправке, SLA и прозрачная передача ответственности между ролями.",
    details: "Команда видит проблемные заказы не в отдельных таблицах, а в той же цепочке, где идет ежедневная обработка.",
  },
  {
    index: "04",
    title: "Маршрутное планирование и OUT",
    text: "Формирование рейсов, назначение курьеров, отправка заказов в доставку и контроль статуса OUT до финального подтверждения.",
    details: "Логистика работает с актуальной картиной склада, а не с устаревшей выгрузкой.",
  },
  {
    index: "05",
    title: "Мобильный курьер",
    text: "Курьер видит маршрут, берет задания, подтверждает забор, меняет статусы в пути и фиксирует вручение или отказ.",
    details: "События из приложения сразу возвращаются в систему, чтобы склад и логистика видели реальное состояние доставки.",
  },
  {
    index: "06",
    title: "Мультифункциональный склад",
    text: "Несколько складов могут работать синхронно: заказ можно передавать между точками, а курьер может перевозить товары со склада на склад.",
    details: "Процесс подходит не только для одного склада, но и для распределенной сети с разными ролями и сценариями движения.",
  },
];

const flow = [
  "приемка товара",
  "ячейка и хранение",
  "сборка",
  "операционный отдел",
  "маршрут",
  "курьер",
  "доставка",
];

const postLogin = [
  "операции склада и TSD",
  "задачи операционного отдела и исключения",
  "маршруты, отправка и OUT",
  "статусы, SLA и мобильный контур курьера",
];

const courierFeatures = [
  "Маршрут на день с актуальными точками доставки",
  "Быстрый переход между задачами и статусами в пути",
  "Подтверждение вручения и фиксация проблемных кейсов",
  "Онлайн-синхронизация с операционным отделом и логистикой без ручных звонков",
];

export default function PublicLanding() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "courier_web_denied") {
      setErr("Аккаунт courier доступен только в мобильном приложении.");
    }
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
    <div className="page">
      <main className="shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">W</span>
            <div>
              <strong>Warehouse Flow</strong>
              <small>warehouse, logistics and courier platform</small>
            </div>
          </div>

          <nav className="nav">
            <a href="#presentation">Функционал</a>
            <a href="#mobile">Мобильный курьер</a>
            <a href="#flexible">Гибкость</a>
            <a href="#login" className="nav-cta">
              Войти
            </a>
          </nav>
        </header>

        <section className="footprint" aria-label="Product capabilities">
          {footprint.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </section>

        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">WMS + TSD + логистика + мобильный курьер</p>
            <h1>Платформа для склада и доставки, где каждый заказ движется по понятному сценарию.</h1>
            <p className="lead">
              Warehouse Flow соединяет склад, операционный отдел, маршрутное планирование,
              мультискладскую передачу и мобильное приложение курьера. Клиент видит не набор
              отдельных экранов, а серьезную операционную систему для ежедневной логистики.
            </p>

            <div className="hero-actions">
              <a href="#login" className="btn primary">
                Войти в систему
              </a>
              <a href="#presentation" className="btn secondary">
                Смотреть презентацию
              </a>
            </div>

            <div className="hero-note">
              <span>Партнерская интеграция</span>
              <div className="partner-chip">
                <img src="/birmarket-logo.svg" alt="Birmarket logo" />
                <small>Birmarket</small>
              </div>
            </div>
          </div>

          <div className="hero-stage">
            <div className="product-scene">
              <div className="scene-map">
                <span className="map-dot dot-a" />
                <span className="map-dot dot-b" />
                <span className="map-dot dot-c" />
                <span className="route-line line-a" />
                <span className="route-line line-b" />
              </div>

              <div className="desktop-shot">
                <div className="shot-top">
                  <span />
                  <span />
                  <span />
                  <b>Warehouse Flow</b>
                </div>
                <div className="shot-body">
                  <aside>
                    <i />
                    <i />
                    <i />
                    <i />
                  </aside>
                  <main>
                    <div className="shot-title">
                      <p>Маршрутное планирование</p>
                      <strong>24 активных рейса</strong>
                    </div>
                    <div className="shot-grid">
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                  </main>
                </div>
              </div>

              <div className="phone-shot hero-phone iphone-mockup">
                <div className="phone-side side-left" />
                <div className="phone-side side-right" />
                <div className="phone-screen">
                  <div className="dynamic-island" />
                  <div className="iphone-status">
                    <span>9:41</span>
                    <b>5G</b>
                  </div>
                  <div className="courier-app-icon">
                    <Image src={courierLogo} alt="Mobile Courier" width={58} height={58} />
                  </div>
                  <span>Mobile Courier</span>
                  <strong>12 точек в маршруте</strong>
                  <p>забор · доставка · подтверждение</p>
                  <div className="route-preview">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="presentation" id="presentation">
          <div className="section-lead">
            <p className="section-kicker">Презентация функционала</p>
            <h2>Вся операционная цепочка собрана в один продукт: от приемки до финальной доставки.</h2>
            <p>
              Лендинг должен сразу показывать масштаб: это не простой складской кабинет, а система,
              которая умеет управлять статусами, людьми, складами, маршрутами и мобильной работой курьера.
            </p>
          </div>

          <div className="feature-list">
            {productSections.map((item) => (
              <article key={item.index} className="feature-row">
                <span>{item.index}</span>
                <div>
                  <p>{item.title}</p>
                  <strong>{item.text}</strong>
                </div>
                <small>{item.details}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="device-showcase">
          <div className="tsd-mockup">
            <div className="device-label">ТСД интерфейс</div>
            <div className="scanner-window">
              <div className="scan-line" />
              <p>Сканирование заказа</p>
              <strong>BRM-240428-0917</strong>
            </div>
            <div className="tsd-screen">
              <div>
                <span>Статус</span>
                <b>Готов к сборке</b>
              </div>
              <div>
                <span>Ячейка</span>
                <b>A-12-04</b>
              </div>
              <div>
                <span>Следующее действие</span>
                <b>Передать в логистику</b>
              </div>
            </div>
          </div>

          <div className="device-copy">
            <p className="section-kicker">Сканирование без лишних шагов</p>
            <h2>ТСД и камера телефона работают как единый инструмент для склада.</h2>
            <p>
              Сотрудник может использовать отдельный ТСД или телефон с камерой. Скан подтверждает
              действие, убирает ручной ввод и сразу связывает заказ с нужной ячейкой, статусом или задачей.
            </p>
          </div>

          <div className="device-pair">
            <div className="side-tsd" aria-hidden>
              <div className="side-tsd-head" />
              <div className="side-tsd-screen">
                <span />
                <span />
              </div>
              <div className="side-tsd-trigger" />
              <div className="side-tsd-handle" />
            </div>

            <div className="phone-mockup iphone-mockup scanner-iphone">
              <div className="phone-side side-left" />
              <div className="phone-side side-right" />
              <div className="phone-screen scanner-phone">
                <div className="dynamic-island" />
                <div className="iphone-status">
                  <span>9:41</span>
                  <b>5G</b>
                </div>
                <div className="camera-frame">
                  <span />
                  <i />
                </div>
                <strong>Скан камерой</strong>
                <p>Наведи телефон на barcode, чтобы принять или передать заказ</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mobile-section" id="mobile">
          <div className="mobile-copy">
            <div className="mobile-logo">
              <Image src={courierLogo} alt="Mobile Courier logo" width={86} height={86} />
            </div>
            <p className="section-kicker">Mobile Courier</p>
            <h2>Отдельное Android-приложение для курьера, доступное через Google Play.</h2>
            <p>
              Курьер получает маршрут, видит задания, подтверждает забор со склада, обновляет статусы
              в пути и закрывает доставку. Логистика и операционный отдел видят эти события сразу.
            </p>

            <div className="play-availability">
              <div className="play-badge" aria-hidden>
                <span className="play-icon">▶</span>
                <span>
                  <small>Доступно в</small>
                  <b>Google Play</b>
                </span>
              </div>
              <p>Установка для курьеров через Google Play, обновления приходят автоматически.</p>
            </div>
          </div>

          <div className="courier-functions">
            {courierFeatures.map((item) => (
              <div key={item}>
                <span />
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flexible-section" id="flexible">
          <div className="section-lead">
            <p className="section-kicker">Гибкость под процесс клиента</p>
            <h2>Система не заставляет бизнес жить по чужому шаблону. Процесс можно подстроить под конкретную задачу.</h2>
            <p>
              Мы можем адаптировать роли, статусы, сценарии передачи, складские зоны, правила маршрутов
              и исключения под вашу операционную модель.
            </p>
          </div>

          <div className="warehouse-flow">
            <div className="warehouse-node">
              <span>Склад A</span>
              <strong>приемка · хранение · сборка</strong>
            </div>
            <div className="transfer-line">
              <i />
              <p>курьерская передача между складами</p>
            </div>
            <div className="warehouse-node">
              <span>Склад B</span>
              <strong>перераспределение · OUT · доставка</strong>
            </div>
          </div>
        </section>

        <section className="flow-section" id="flow">
          <p className="section-kicker">Единая цепочка статусов</p>
          <div className="flow-line">
            {flow.map((item, index) => (
              <div key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="login-section" id="login">
          <div className="login-copy">
            <p className="section-kicker">Вход в систему</p>
            <h2>После авторизации команда попадает в рабочий контур склада, логистики и доставки.</h2>
            <p>
              Внутри доступны {postLogin.join(", ")}. Роли получают свои разделы, а каждое действие
              остается частью общей истории заказа.
            </p>
          </div>

          <div className="login-card">
            <div className="login-head">
              <h3>Авторизация</h3>
              <p>Для склада, логистики, руководителей и операторов системы</p>
            </div>

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
          </div>
        </section>
      </main>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background:
            radial-gradient(circle at 8% 0%, rgba(255, 179, 59, 0.22), transparent 28%),
            radial-gradient(circle at 92% 14%, rgba(47, 128, 237, 0.16), transparent 30%),
            linear-gradient(180deg, #fbfaf6 0%, #edf2f6 48%, #f8fafc 100%);
          color: #101827;
          padding: 18px 14px 36px;
        }

        .shell {
          max-width: 1260px;
          margin: 0 auto;
        }

        .topbar {
          min-height: 74px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          border-bottom: 1px solid rgba(16, 24, 39, 0.12);
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .brand-mark {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #101827;
          color: #fff;
          font-weight: 900;
          letter-spacing: -0.04em;
        }

        .brand strong,
        .brand small {
          display: block;
        }

        .brand strong {
          font-size: 15px;
        }

        .brand small {
          margin-top: 2px;
          color: #66758a;
          font-size: 12px;
        }

        .nav {
          display: flex;
          gap: 18px;
          align-items: center;
          flex-wrap: wrap;
        }

        .nav a {
          color: #405167;
          text-decoration: none;
          font-size: 14px;
          font-weight: 700;
        }

        .nav-cta {
          border: 1px solid #cfd8e3;
          border-radius: 999px;
          padding: 9px 13px;
          background: rgba(255, 255, 255, 0.64);
        }

        .footprint {
          padding: 18px 0;
          display: flex;
          flex-wrap: wrap;
          gap: 10px 18px;
          border-bottom: 1px solid rgba(16, 24, 39, 0.1);
        }

        .footprint span {
          color: #738298;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .hero {
          min-height: 680px;
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
          gap: 32px;
          align-items: center;
          padding: 64px 0 56px;
          border-bottom: 1px solid rgba(16, 24, 39, 0.1);
        }

        .eyebrow,
        .section-kicker {
          margin: 0;
          color: #a15c00;
          font-size: 12px;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          font-weight: 900;
        }

        h1,
        h2,
        h3,
        p {
          margin-top: 0;
        }

        h1 {
          margin: 16px 0 0;
          max-width: 780px;
          font-size: clamp(46px, 6vw, 86px);
          line-height: 0.93;
          letter-spacing: -0.06em;
        }

        .lead {
          margin: 22px 0 0;
          max-width: 710px;
          color: #53657b;
          font-size: 18px;
          line-height: 1.72;
        }

        .hero-actions {
          margin-top: 28px;
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          min-height: 48px;
          padding: 0 20px;
          text-decoration: none;
          font-size: 14px;
          font-weight: 900;
          border: 1px solid transparent;
        }

        .btn.primary {
          background: #101827;
          color: #fff;
          box-shadow: 0 18px 32px rgba(16, 24, 39, 0.2);
        }

        .btn.secondary {
          background: rgba(255, 255, 255, 0.72);
          border-color: #cfd8e3;
          color: #101827;
        }

        .hero-note {
          margin-top: 32px;
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .hero-note > span {
          color: #7a8798;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .partner-chip {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border-radius: 999px;
          padding: 10px 14px;
          background: #fff;
          border: 1px solid #dce4ed;
        }

        .partner-chip img {
          height: 20px;
          width: auto;
          display: block;
        }

        .partner-chip small {
          color: #26384d;
          font-size: 13px;
          font-weight: 800;
        }

        .product-scene {
          min-height: 520px;
          position: relative;
        }

        .scene-map {
          position: absolute;
          inset: 10px 0 0 0;
          border-radius: 40px;
          background:
            linear-gradient(90deg, rgba(16, 24, 39, 0.05) 1px, transparent 1px),
            linear-gradient(rgba(16, 24, 39, 0.05) 1px, transparent 1px);
          background-size: 34px 34px;
          mask-image: radial-gradient(circle at center, #000 54%, transparent 75%);
        }

        .map-dot,
        .route-line {
          position: absolute;
          display: block;
        }

        .map-dot {
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: #ffb33b;
          box-shadow: 0 0 0 10px rgba(255, 179, 59, 0.16);
        }

        .dot-a {
          left: 14%;
          top: 22%;
        }

        .dot-b {
          right: 18%;
          top: 42%;
          background: #2f80ed;
          box-shadow: 0 0 0 10px rgba(47, 128, 237, 0.14);
        }

        .dot-c {
          left: 48%;
          bottom: 22%;
          background: #34a853;
          box-shadow: 0 0 0 10px rgba(52, 168, 83, 0.14);
        }

        .route-line {
          height: 2px;
          width: 220px;
          transform: rotate(16deg);
          background: linear-gradient(90deg, transparent, rgba(16, 24, 39, 0.26), transparent);
        }

        .line-a {
          left: 18%;
          top: 35%;
        }

        .line-b {
          right: 20%;
          bottom: 32%;
          transform: rotate(-22deg);
        }

        .desktop-shot {
          position: absolute;
          left: 0;
          right: 8%;
          top: 64px;
          min-height: 330px;
          border-radius: 30px;
          overflow: hidden;
          background: #fff;
          border: 1px solid #d6e0ea;
          box-shadow: 0 34px 80px rgba(16, 24, 39, 0.16);
        }

        .shot-top {
          height: 48px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 16px;
          background: #101827;
          color: #fff;
        }

        .shot-top span {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.38);
        }

        .shot-top b {
          margin-left: 8px;
          font-size: 13px;
        }

        .shot-body {
          display: grid;
          grid-template-columns: 72px 1fr;
          min-height: 282px;
        }

        .shot-body aside {
          padding: 22px 18px;
          display: grid;
          gap: 13px;
          align-content: start;
          background: #f3f6f9;
          border-right: 1px solid #dde6ef;
        }

        .shot-body aside i {
          height: 30px;
          border-radius: 10px;
          background: #fff;
          border: 1px solid #dde6ef;
        }

        .shot-body main {
          padding: 26px;
        }

        .shot-title p {
          margin: 0;
          color: #7b8a9d;
          font-size: 13px;
          font-weight: 800;
        }

        .shot-title strong {
          display: block;
          margin-top: 8px;
          font-size: 34px;
          letter-spacing: -0.04em;
        }

        .shot-grid {
          margin-top: 24px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .shot-grid span {
          height: 72px;
          border-radius: 18px;
          background:
            linear-gradient(90deg, rgba(47, 128, 237, 0.14), transparent),
            #f7fafc;
          border: 1px solid #dde6ef;
        }

        .phone-shot,
        .phone-mockup {
          width: 210px;
          border-radius: 34px;
          background: #101827;
          padding: 12px;
          box-shadow: 0 34px 70px rgba(16, 24, 39, 0.24);
        }

        .hero-phone {
          position: absolute;
          right: 0;
          bottom: 10px;
          transform: rotate(4deg);
        }

        .iphone-mockup {
          width: 232px;
          border-radius: 44px;
          padding: 10px;
          background:
            linear-gradient(145deg, #2a303a 0%, #080b10 46%, #343b46 100%);
          border: 1px solid rgba(255, 255, 255, 0.14);
          box-shadow:
            0 38px 80px rgba(16, 24, 39, 0.28),
            inset 0 0 0 1px rgba(255, 255, 255, 0.12);
        }

        .iphone-mockup::before {
          content: "";
          position: absolute;
          inset: 7px;
          border-radius: 38px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          pointer-events: none;
          z-index: 2;
        }

        .phone-side {
          position: absolute;
          width: 3px;
          border-radius: 999px;
          background: linear-gradient(180deg, #3d4652, #111720);
        }

        .side-left {
          left: -3px;
          top: 96px;
          height: 58px;
        }

        .side-right {
          right: -3px;
          top: 126px;
          height: 76px;
        }

        .iphone-mockup .phone-screen {
          min-height: 318px;
          border-radius: 35px;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 75% 0%, rgba(47, 128, 237, 0.26), transparent 34%),
            radial-gradient(circle at 18% 20%, rgba(255, 179, 59, 0.24), transparent 32%),
            linear-gradient(180deg, #fbfdff 0%, #eef4f8 100%);
          padding: 28px 18px 18px;
          border: 1px solid rgba(255, 255, 255, 0.18);
        }

        .dynamic-island {
          position: absolute;
          top: 11px;
          left: 50%;
          width: 76px;
          height: 23px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: #05070a;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
          z-index: 3;
        }

        .iphone-status {
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: #1a2635;
          font-size: 11px;
          font-weight: 900;
          margin-bottom: auto;
          padding: 0 4px;
        }

        .iphone-status span,
        .iphone-status b {
          margin: 0;
          color: #1a2635;
          font-size: 11px;
          line-height: 1;
          letter-spacing: 0;
          text-transform: none;
        }

        .courier-app-icon {
          margin-top: 72px;
          width: 68px;
          height: 68px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 18px 34px rgba(16, 24, 39, 0.18);
        }

        .courier-app-icon :global(img) {
          width: 58px;
          height: 58px;
          border-radius: 16px;
          object-fit: cover;
          box-shadow: none;
        }

        .iphone-mockup .phone-screen > span {
          margin-top: 16px;
          color: #516176;
          font-size: 11px;
        }

        .iphone-mockup .phone-screen strong {
          max-width: 170px;
          font-size: 25px;
          letter-spacing: -0.04em;
        }

        .iphone-mockup .phone-screen p {
          color: #617288;
        }

        .route-preview {
          margin-top: 16px;
          display: grid;
          gap: 7px;
        }

        .route-preview i {
          display: block;
          height: 8px;
          border-radius: 999px;
          background: rgba(16, 24, 39, 0.1);
        }

        .route-preview i:nth-child(1) {
          width: 88%;
          background: rgba(47, 128, 237, 0.22);
        }

        .route-preview i:nth-child(2) {
          width: 66%;
        }

        .route-preview i:nth-child(3) {
          width: 74%;
        }

        .phone-speaker {
          width: 54px;
          height: 5px;
          margin: 3px auto 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.24);
        }

        .phone-screen {
          min-height: 282px;
          border-radius: 25px;
          background:
            radial-gradient(circle at top, rgba(255, 179, 59, 0.28), transparent 36%),
            #f7fafc;
          padding: 20px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
        }

        .phone-screen :global(img) {
          border-radius: 18px;
          box-shadow: 0 10px 24px rgba(16, 24, 39, 0.2);
        }

        .phone-screen span {
          margin-top: 18px;
          color: #6d7d91;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .phone-screen strong {
          margin-top: 7px;
          font-size: 22px;
          line-height: 1.08;
        }

        .phone-screen p {
          margin: 8px 0 0;
          color: #607085;
          font-size: 13px;
          line-height: 1.45;
        }

        .presentation,
        .device-showcase,
        .mobile-section,
        .flexible-section,
        .flow-section,
        .login-section {
          padding: 74px 0;
          border-bottom: 1px solid rgba(16, 24, 39, 0.1);
        }

        .section-lead {
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
          gap: 28px;
          align-items: end;
        }

        .section-lead h2,
        .device-copy h2,
        .mobile-copy h2,
        .flexible-section h2,
        .login-copy h2 {
          margin: 10px 0 0;
          font-size: clamp(34px, 4vw, 58px);
          line-height: 1;
          letter-spacing: -0.05em;
        }

        .section-lead p:last-child,
        .device-copy p,
        .mobile-copy p,
        .login-copy p {
          color: #56677c;
          font-size: 16px;
          line-height: 1.7;
        }

        .feature-list {
          margin-top: 42px;
          border-top: 1px solid rgba(16, 24, 39, 0.12);
        }

        .feature-row {
          min-height: 142px;
          display: grid;
          grid-template-columns: 80px minmax(0, 1.15fr) minmax(260px, 0.85fr);
          gap: 22px;
          align-items: center;
          border-bottom: 1px solid rgba(16, 24, 39, 0.12);
        }

        .feature-row > span {
          color: #b46a00;
          font-size: 13px;
          font-weight: 900;
        }

        .feature-row p {
          margin: 0 0 9px;
          color: #718096;
          font-size: 13px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .feature-row strong {
          display: block;
          max-width: 680px;
          font-size: 25px;
          line-height: 1.2;
          letter-spacing: -0.025em;
        }

        .feature-row small {
          color: #5d6f84;
          font-size: 14px;
          line-height: 1.6;
        }

        .device-showcase {
          display: grid;
          grid-template-columns: minmax(260px, 0.8fr) minmax(0, 1.05fr) minmax(330px, 0.78fr);
          gap: 30px;
          align-items: center;
        }

        .tsd-mockup {
          border-radius: 34px;
          background: #101827;
          padding: 18px;
          color: #fff;
          box-shadow: 0 30px 70px rgba(16, 24, 39, 0.22);
        }

        .device-label {
          color: rgba(255, 255, 255, 0.58);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .scanner-window {
          margin-top: 14px;
          min-height: 140px;
          border-radius: 22px;
          background:
            linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px),
            #1b2636;
          background-size: 22px 22px;
          padding: 20px;
          position: relative;
          overflow: hidden;
        }

        .scan-line {
          position: absolute;
          left: 18px;
          right: 18px;
          top: 54%;
          height: 2px;
          background: #34a853;
          box-shadow: 0 0 20px rgba(52, 168, 83, 0.86);
        }

        .scanner-window p {
          margin: 0;
          color: rgba(255, 255, 255, 0.62);
          font-size: 13px;
        }

        .scanner-window strong {
          position: absolute;
          left: 20px;
          bottom: 18px;
          font-size: 18px;
        }

        .tsd-screen {
          margin-top: 14px;
          display: grid;
          gap: 10px;
        }

        .tsd-screen div {
          border-radius: 16px;
          padding: 13px;
          background: rgba(255, 255, 255, 0.08);
        }

        .tsd-screen span,
        .tsd-screen b {
          display: block;
        }

        .tsd-screen span {
          color: rgba(255, 255, 255, 0.55);
          font-size: 12px;
        }

        .tsd-screen b {
          margin-top: 4px;
          font-size: 15px;
        }

        .scanner-phone {
          justify-content: center;
          background: #f8fbfd;
        }

        .device-pair {
          min-height: 390px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 18px;
          position: relative;
        }

        .scanner-iphone {
          position: relative;
          width: 218px;
          transform: rotate(-2deg);
          z-index: 2;
        }

        .scanner-iphone .phone-screen {
          min-height: 322px;
          justify-content: flex-start;
          gap: 14px;
          padding-top: 44px;
        }

        .scanner-iphone .iphone-status {
          width: 100%;
          margin-bottom: 0;
        }

        .scanner-iphone .camera-frame {
          margin-top: 12px;
        }

        .scanner-iphone .phone-screen strong {
          margin-top: 2px;
          font-size: 24px;
          letter-spacing: -0.04em;
        }

        .scanner-iphone .phone-screen p {
          margin-top: -4px;
        }

        .side-tsd {
          width: 88px;
          height: 268px;
          border-radius: 24px 18px 18px 24px;
          background:
            linear-gradient(90deg, #111821 0%, #222b37 42%, #0b1017 100%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 28px 54px rgba(16, 24, 39, 0.26);
          position: relative;
          transform: rotate(8deg) translateY(16px);
          z-index: 1;
        }

        .side-tsd::before {
          content: "";
          position: absolute;
          left: 9px;
          right: 9px;
          top: 12px;
          height: 34px;
          border-radius: 13px;
          background:
            linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px),
            #0b1118;
          background-size: 8px 8px;
        }

        .side-tsd-head {
          position: absolute;
          left: 18px;
          right: 18px;
          top: -22px;
          height: 34px;
          border-radius: 18px 18px 8px 8px;
          background: #0c1219;
          box-shadow: inset 0 -8px 0 rgba(255, 255, 255, 0.04);
        }

        .side-tsd-screen {
          position: absolute;
          left: 12px;
          right: 12px;
          top: 62px;
          height: 84px;
          border-radius: 14px;
          background:
            radial-gradient(circle at 70% 20%, rgba(52, 168, 83, 0.22), transparent 34%),
            #dfe9ef;
          padding: 12px 9px;
          display: grid;
          align-content: end;
          gap: 7px;
        }

        .side-tsd-screen span {
          display: block;
          height: 7px;
          border-radius: 999px;
          background: rgba(16, 24, 39, 0.24);
        }

        .side-tsd-screen span:first-child {
          width: 86%;
        }

        .side-tsd-screen span:last-child {
          width: 62%;
        }

        .side-tsd-trigger {
          position: absolute;
          right: -9px;
          top: 112px;
          width: 16px;
          height: 46px;
          border-radius: 0 10px 10px 0;
          background: #ffb33b;
          box-shadow: 0 8px 18px rgba(255, 179, 59, 0.22);
        }

        .side-tsd-handle {
          position: absolute;
          left: 24px;
          right: 24px;
          bottom: -96px;
          height: 116px;
          border-radius: 0 0 22px 22px;
          background:
            linear-gradient(90deg, #101721 0%, #263242 48%, #101721 100%);
          transform: perspective(120px) rotateX(-10deg);
          box-shadow: 0 26px 42px rgba(16, 24, 39, 0.22);
        }

        .side-tsd-handle::after {
          content: "";
          position: absolute;
          left: 11px;
          right: 11px;
          top: 16px;
          height: 58px;
          border-radius: 999px;
          border: 2px solid rgba(255, 255, 255, 0.08);
        }

        .camera-frame {
          height: 138px;
          border-radius: 20px;
          border: 2px solid #101827;
          position: relative;
          background:
            linear-gradient(90deg, transparent 48%, rgba(47, 128, 237, 0.2) 50%, transparent 52%),
            linear-gradient(#e9eff5, #fff);
        }

        .camera-frame span {
          position: absolute;
          left: 16px;
          right: 16px;
          top: 50%;
          height: 2px;
          background: #ef4444;
          margin: 0;
        }

        .camera-frame i {
          position: absolute;
          left: 28px;
          right: 28px;
          bottom: 32px;
          height: 28px;
          border-radius: 6px;
          background: repeating-linear-gradient(90deg, #101827 0 3px, transparent 3px 7px);
        }

        .mobile-section {
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
          gap: 46px;
          align-items: center;
        }

        .mobile-logo {
          width: 104px;
          height: 104px;
          border-radius: 28px;
          background: #fff;
          border: 1px solid #dbe4ee;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 20px 44px rgba(16, 24, 39, 0.12);
          margin-bottom: 18px;
        }

        .mobile-logo :global(img) {
          border-radius: 22px;
        }

        .courier-functions {
          display: grid;
          gap: 0;
          border-top: 1px solid rgba(16, 24, 39, 0.12);
        }

        .courier-functions div {
          display: grid;
          grid-template-columns: 28px 1fr;
          gap: 12px;
          align-items: start;
          padding: 22px 0;
          border-bottom: 1px solid rgba(16, 24, 39, 0.12);
        }

        .courier-functions span {
          margin-top: 6px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #2f80ed;
          box-shadow: 0 0 0 8px rgba(47, 128, 237, 0.12);
        }

        .courier-functions p {
          margin: 0;
          color: #26384d;
          font-size: 21px;
          line-height: 1.3;
          letter-spacing: -0.02em;
          font-weight: 800;
        }

        .play-availability {
          margin-top: 24px;
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .play-badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border-radius: 15px;
          background: #101827;
          color: #fff;
          padding: 10px 13px;
          width: fit-content;
        }

        .play-icon {
          width: 28px;
          height: 28px;
          border-radius: 9px;
          background: #34a853;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          padding-left: 1px;
        }

        .play-badge small,
        .play-badge b {
          display: block;
          line-height: 1.05;
        }

        .play-badge small {
          color: rgba(255, 255, 255, 0.66);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .play-badge b {
          margin-top: 3px;
          font-size: 15px;
        }

        .play-availability p {
          margin: 0;
          max-width: 300px;
          color: #5d6f84;
          font-size: 13px;
          line-height: 1.45;
        }

        .warehouse-flow {
          margin-top: 42px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(220px, 0.55fr) minmax(0, 1fr);
          gap: 22px;
          align-items: center;
        }

        .warehouse-node {
          min-height: 180px;
          border-radius: 34px;
          border: 1px solid #d6e0ea;
          background:
            linear-gradient(rgba(16, 24, 39, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(16, 24, 39, 0.04) 1px, transparent 1px),
            rgba(255, 255, 255, 0.7);
          background-size: 28px 28px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 24px;
        }

        .warehouse-node span {
          color: #a15c00;
          font-size: 13px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .warehouse-node strong {
          margin-top: 8px;
          font-size: 28px;
          line-height: 1.12;
          letter-spacing: -0.03em;
        }

        .transfer-line {
          text-align: center;
          color: #53657b;
          font-size: 13px;
          font-weight: 800;
        }

        .transfer-line i {
          display: block;
          height: 2px;
          margin-bottom: 12px;
          background: linear-gradient(90deg, transparent, #101827, transparent);
          position: relative;
        }

        .transfer-line i::after {
          content: "";
          position: absolute;
          right: 18%;
          top: -5px;
          width: 12px;
          height: 12px;
          border-top: 2px solid #101827;
          border-right: 2px solid #101827;
          transform: rotate(45deg);
        }

        .flow-line {
          margin-top: 24px;
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          border-top: 1px solid rgba(16, 24, 39, 0.16);
        }

        .flow-line div {
          min-height: 120px;
          padding: 18px 14px 0 0;
          border-right: 1px solid rgba(16, 24, 39, 0.12);
        }

        .flow-line span {
          color: #a15c00;
          font-size: 12px;
          font-weight: 900;
        }

        .flow-line p {
          margin: 14px 0 0;
          color: #26384d;
          font-size: 16px;
          font-weight: 800;
          line-height: 1.3;
        }

        .login-section {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(360px, 420px);
          gap: 48px;
          align-items: start;
          border-bottom: none;
        }

        .login-card {
          border-radius: 30px;
          border: 1px solid #d8e2ec;
          background: rgba(255, 255, 255, 0.76);
          padding: 22px;
          display: grid;
          gap: 13px;
          box-shadow: 0 24px 54px rgba(16, 24, 39, 0.1);
        }

        .login-head h3 {
          margin: 0;
          font-size: 24px;
          letter-spacing: -0.02em;
        }

        .login-head p {
          margin: 8px 0 0;
          color: #66758a;
          font-size: 14px;
          line-height: 1.55;
        }

        .login-card label {
          display: grid;
          gap: 8px;
          color: #26384d;
          font-size: 14px;
          font-weight: 800;
        }

        .login-card input {
          width: 100%;
          box-sizing: border-box;
          border-radius: 16px;
          border: 1px solid #d7dfe8;
          background: #fff;
          color: #101827;
          padding: 14px;
          font-size: 15px;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .login-card input:focus {
          border-color: #2f80ed;
          box-shadow: 0 0 0 3px rgba(47, 128, 237, 0.12);
        }

        .submit {
          width: 100%;
          border: none;
          border-radius: 16px;
          padding: 15px 16px;
          background: #101827;
          color: #fff;
          font-size: 15px;
          font-weight: 900;
          cursor: pointer;
        }

        .submit:disabled {
          opacity: 0.72;
          cursor: not-allowed;
        }

        .error {
          border-radius: 14px;
          border: 1px solid #fecaca;
          background: #fff5f5;
          color: #b42318;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }

        .loading {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .spinner {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.28);
          border-top-color: #fff;
          animation: spin 0.7s linear infinite;
        }

        @media (max-width: 1080px) {
          .hero,
          .section-lead,
          .device-showcase,
          .mobile-section,
          .warehouse-flow,
          .login-section {
            grid-template-columns: 1fr;
          }

          .product-scene {
            min-height: 560px;
          }

          .flow-line {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .page {
            padding: 12px 10px 24px;
          }

          .topbar {
            align-items: flex-start;
            flex-direction: column;
            padding-bottom: 16px;
          }

          .nav,
          .nav a,
          .btn,
          .hero-actions {
            width: 100%;
          }

          .hero {
            min-height: auto;
            padding: 42px 0;
          }

          h1 {
            font-size: 42px;
          }

          .product-scene {
            min-height: 580px;
          }

          .desktop-shot {
            right: 0;
          }

          .hero-phone {
            right: 12px;
          }

          .feature-row {
            grid-template-columns: 1fr;
            gap: 10px;
            padding: 24px 0;
          }

          .flow-line {
            grid-template-columns: 1fr;
          }

          .flow-line div {
            min-height: auto;
            padding: 18px 0;
            border-right: none;
            border-bottom: 1px solid rgba(16, 24, 39, 0.12);
          }
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
