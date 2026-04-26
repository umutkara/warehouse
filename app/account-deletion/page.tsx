import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Удаление аккаунта — MC Courier",
  description:
    "Как запросить удаление аккаунта и связанных данных мобильного приложения MC Courier.",
};

const contactEmail = "umutkara.99@gmail.com";

export default function AccountDeletionPage() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "2rem 1.25rem 4rem",
        color: "var(--color-text)",
        lineHeight: 1.65,
        fontSize: "1rem",
      }}
    >
      <p style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/privacy"
          style={{ color: "var(--color-primary)", textDecoration: "none" }}
        >
          ← Политика конфиденциальности
        </Link>
      </p>

      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Удаление аккаунта и данных
      </h1>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "2rem" }}>
        Эта страница относится к мобильному приложению <strong>MC Courier</strong> и
        складской системе Warehouse. Разработчик/контакт для запросов:{" "}
        <a
          href={`mailto:${contactEmail}`}
          style={{ color: "var(--color-primary)", wordBreak: "break-all" }}
        >
          {contactEmail}
        </a>
        .
      </p>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Как запросить удаление аккаунта
        </h2>
        <ol style={{ paddingLeft: "1.25rem", margin: 0 }}>
          <li style={{ marginBottom: "0.75rem" }}>
            Отправьте письмо на{" "}
            <a
              href={`mailto:${contactEmail}?subject=MC%20Courier%20account%20deletion%20request`}
              style={{ color: "var(--color-primary)", wordBreak: "break-all" }}
            >
              {contactEmail}
            </a>{" "}
            с темой <strong>MC Courier account deletion request</strong>.
          </li>
          <li style={{ marginBottom: "0.75rem" }}>
            Укажите email или идентификатор аккаунта, который используется для входа в
            приложение MC Courier.
          </li>
          <li style={{ marginBottom: "0.75rem" }}>
            Если аккаунт выдан работодателем или подрядчиком, укажите название организации,
            чтобы мы могли подтвердить право на удаление рабочих данных.
          </li>
          <li style={{ marginBottom: "0.75rem" }}>
            После проверки запроса мы подтвердим получение письма и сообщим о результате
            удаления или о данных, которые должны быть сохранены по закону или рабочим
            требованиям.
          </li>
        </ol>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Какие данные будут удалены
        </h2>
        <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
          <li style={{ marginBottom: "0.5rem" }}>
            Учётная запись пользователя, если её удаление не нарушает требования учёта
            складских операций.
          </li>
          <li style={{ marginBottom: "0.5rem" }}>
            Сессии входа и технические токены доступа.
          </li>
          <li style={{ marginBottom: "0.5rem" }}>
            Персональные контактные данные, связанные с аккаунтом, например email и отображаемое
            имя.
          </li>
          <li style={{ marginBottom: "0.5rem" }}>
            Необязательные пользовательские данные, которые не требуются для аудита доставок,
            смен и складских операций.
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Какие данные могут быть сохранены
        </h2>
        <p>
          MC Courier используется для рабочих складских и курьерских процессов. Поэтому часть
          данных может быть сохранена, если это необходимо для исполнения договора, бухгалтерского
          или юридического учёта, предотвращения мошенничества, разрешения споров, аудита операций
          или выполнения требований работодателя/оператора склада.
        </p>
        <ul style={{ paddingLeft: "1.25rem", margin: "0.75rem 0 0" }}>
          <li style={{ marginBottom: "0.5rem" }}>
            История заказов, смен, передач, доставок, возвратов и складских операций.
          </li>
          <li style={{ marginBottom: "0.5rem" }}>
            Журналы действий, подтверждения доставки, подписи, фотографии и результаты сканирования,
            если они нужны для подтверждения факта выполнения работ.
          </li>
          <li style={{ marginBottom: "0.5rem" }}>
            Геолокационные записи, связанные с активными сменами и выполненными заданиями, если они
            требуются для операционного аудита.
          </li>
          <li style={{ marginBottom: "0.5rem" }}>
            Резервные копии и системные журналы до окончания стандартного срока их хранения.
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Сроки обработки и хранения
        </h2>
        <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
          <li style={{ marginBottom: "0.5rem" }}>
            Запрос на удаление обычно рассматривается в течение <strong>30 дней</strong> после
            подтверждения личности и права на удаление.
          </li>
          <li style={{ marginBottom: "0.5rem" }}>
            Данные, которые не нужны для юридического, финансового или операционного учёта, удаляются
            или обезличиваются после обработки запроса.
          </li>
          <li style={{ marginBottom: "0.5rem" }}>
            Данные, которые должны быть сохранены для аудита, безопасности, споров или требований
            закона, могут храниться до <strong>5 лет</strong> либо в течение срока, требуемого
            применимым законодательством или договорными обязательствами.
          </li>
          <li style={{ marginBottom: "0.5rem" }}>
            Резервные копии могут сохраняться до <strong>90 дней</strong> до планового удаления или
            перезаписи.
          </li>
        </ul>
      </section>

      <section>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Связанные документы
        </h2>
        <p>
          Подробная информация об обработке данных доступна в{" "}
          <Link href="/privacy" style={{ color: "var(--color-primary)" }}>
            политике конфиденциальности MC Courier
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
