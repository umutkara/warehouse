import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

enum AppLang { ru, az }

class AppLangController {
  AppLangController([AppLang initial = AppLang.ru])
      : lang = ValueNotifier<AppLang>(initial);

  final ValueNotifier<AppLang> lang;

  void set(AppLang next) => lang.value = next;
}

class AppI18n extends InheritedNotifier<ValueNotifier<AppLang>> {
  const AppI18n({
    super.key,
    required super.notifier,
    required this.controller,
    required super.child,
  });

  final AppLangController controller;

  static AppI18n of(BuildContext context) {
    final widget = context.dependOnInheritedWidgetOfExactType<AppI18n>();
    assert(widget != null, 'AppI18n is missing in widget tree');
    return widget!;
  }
}

extension AppI18nX on BuildContext {
  AppLang get lang => AppI18n.of(this).notifier!.value;

  String t(String key) {
    final current = lang;
    final ru = _ru[key];
    final az = _az[key];
    final from = current == AppLang.az ? az : ru;
    if (from != null) return from;
    // fallback to RU, then to key
    return ru ?? key;
  }
}

const Map<String, String> _ru = <String, String>{
  'app.title': 'Курьер',
  'app.courier_fallback': 'Курьер',
  'nav.tasks': 'Задачи',
  'nav.pickup': 'Забор',
  'nav.shift': 'Смена',
  'home.title': 'Курьер: {name}',
  'home.queue': 'Очередь: {count}',
  'home.refresh': 'Обновить',
  'home.privacy_policy': 'Политика конфиденциальности',
  'home.logout': 'Выйти',
  'lang.ru': 'RU',
  'lang.az': 'AZ',
  'task.finish_route': 'Закончить рейс',

  'task.details.title': 'Детали задачи',
  'task.not_picked': 'НЕ ЗАБРАН',
  'task.source_logistics': 'Источник: назначено логистом{suffix}',
  'task.source_suffix_name': ' ({name})',
  'task.assigned_not_confirmed':
      'Заказ назначен логистом, но курьер еще не подтвердил фактический забор из точки.',
  'task.claimed_at': 'Взято в работу: {dt}',
  'task.zone': 'Зона: {zone}',
  'task.scenario': 'Сценарий: {scenario}',

  'pickup.confirm': 'Подтвердить забор',
  'pickup.reject': 'Незабор',
  'self_pickup.block':
      'Самостоятельный забор. Сдаётся только при закрытии смены.',
  'drop.undo.snack': 'Дроп отменён',
  'drop.undo': 'Отменить дроп',
  'ops.snack.drop_sent': 'Дроп отправлен с OPS статусом',
  'ops.snack.status_sent': 'OPS статус отправлен (заказ остался у курьера)',

  'ops.dialog.title': 'OPS статус',
  'ops.dialog.status_required': 'Статус (обязательно):',
  'ops.dialog.will_create_drop':
      'Будет создана точка дропа, заказ уйдет из рук курьера.',
  'ops.dialog.wont_create_drop':
      'Точка дропа не создается, заказ остается у курьера.',
  'ops.dialog.comment_required': 'Комментарий (обязательно)',
  'ops.dialog.comment_optional': 'Комментарий (опционально)',
  'ops.dialog.sig_reject_required':
      'Подпись отказавшей стороны (обязательно):',
  'ops.dialog.sig_accept_required':
      'Подпись принимающей стороны (обязательно):',
  'ops.dialog.sig_clear': 'Очистить подпись',
  'ops.dialog.photo_required': 'Фото акта (обязательно):',
  'ops.dialog.photo_change': 'Изменить',
  'ops.dialog.photo_take': 'Сделать фото акта',
  'common.cancel': 'Отмена',
  'ops.dialog.confirm_drop': 'Подтвердить дроп',
  'ops.dialog.save_status': 'Сохранить статус',

  'ops.rule.partner_accepted_return': 'Партнер принял на возврат',
  'ops.rule.partner_rejected_return': 'Партнер не принял на возврат',
  'ops.rule.sent_to_sc': 'Передан в СЦ',
  'ops.rule.client_accepted': 'Клиент принял',
  'ops.rule.client_rejected': 'Клиент не принял',
  'ops.rule.delivered_to_pudo': 'Товар доставлен на ПУДО',
  'ops.rule.postponed_1': 'Перенос',
  'ops.rule.in_progress': 'В работе',

  'tasks.load_error': 'Не удалось загрузить задачи:\n{error}',
  'tasks.my_tasks': 'Мои задачи',
  'tasks.no_active_tasks': 'Пока нет активных задач',
  'tasks.transfer_selected': 'Передать выбранные ({count})',
  'tasks.pickup_confirmed': 'Забор подтвержден',
  'tasks.transfer.title': 'Передать заказы',
  'tasks.transfer.body':
      'Выбранные заказы будут сняты с ваших рук (передача другому лицу). Unit не удаляются — их можно снова добавить по скану.',
  'tasks.transfer.comment_optional_hint': 'Комментарий (необязательно)',
  'tasks.transfer.action': 'Передать',
  'tasks.transferred_snack': 'Передано: {count} заказов',
  'tasks.pickup_confirmed_for': 'Забор подтвержден: {barcode}',
  'tasks.pickup_reject_saved': 'Незабор сохранен',
  'tasks.pickup_reject.title': 'Незабор',
  'tasks.pickup_reject.reason_hint': 'Укажите причину незабора',
  'common.save': 'Сохранить',
  'tasks.pickup_reject_saved_for': 'Незабор сохранен: {barcode}',
  'tasks.pending.title': 'Задания от логистов — неподтвержденные ({count})',
  'tasks.pending.subtitle': 'Подтвердите забор или укажите незабор с причиной',
  'tasks.pending.body':
      'Подтвердите забор сканом или выберите заказы и подтвердите массово.',
  'tasks.pending.scan_label': 'Скан штрихкода для авто-подтверждения',
  'tasks.pending.scan_confirm': 'Сканировать и подтвердить',
  'tasks.pending.none': 'Нет неподтвержденных заказов',
  'tasks.pending.out_at': 'Отгружен: {dt}',
  'tasks.pending.product': 'Товар: {name}',
  'tasks.pending.partner': 'Партнер: {name}',
  'tasks.pending.scenario': 'Сценарий: {scenario}',
  'tasks.pending.confirm_bulk': 'Подтвердить забор ({count})',
  'tasks.pending.reject_bulk': 'Незабор ({count})',
  'tasks.pending.not_found': 'Данного заказа нет',
  'tasks.pending.scan_confirm_title': 'Сканировать и подтвердить',
  'tasks.pending.scan_confirm_snack': 'Забор подтвержден сканом: {barcode}',
  'tasks.no_scenario': 'Без сценария',
  'task.assigned_by_logistics': 'Назначено логистом{suffix}',
  'task.assigned_suffix_name': ': {name}',
  'task.claimed_short': 'Взято: {dt}',
  'common.open': 'Открыть',

  'signature.giver.title': 'Подпись передающего',
  'signature.giver.body': 'Запросите подпись лица, передавшего заказ.',
  'signature.giver.clear': 'Очистить подпись',
  'signature.giver.confirm': 'Подтвердить',

  'gps.title': 'Включите GPS для работы приложения',
  'gps.body':
      'Приложение курьера работает только с включённой геолокацией. Включите GPS в настройках устройства.',
  'gps.retry': 'Проверить снова',

  'login.supabase_not_configured':
      'Supabase не настроен. Передайте SUPABASE_URL и SUPABASE_ANON_KEY через --dart-define.',
  'login.session_expired': 'Сессия истекла. Войдите снова.',
  'login.failed': 'Не удалось выполнить вход',
  'login.title': 'Курьер',
  'login.email': 'Электронная почта',
  'login.email_invalid': 'Введите корректный email',
  'login.password': 'Пароль',
  'login.password_short': 'Слишком короткий пароль',
  'login.remember': 'Запомнить вход',
  'login.start_shift': 'Начать смену',
  'login.privacy_policy': 'Политика конфиденциальности',

  'shift.current.title': 'Текущая смена',
  'shift.current.none': 'Открытая смена не найдена',
  'shift.current.id': 'ID смены: {id}',
  'shift.current.status': 'Статус: {status}',
  'shift.current.started': 'Начата: {dt}',
  'shift.current.active_tasks': 'Активных задач: {count}',
  'shift.summary.title': 'Сводка смены',
  'shift.metric.assigned': 'Назначено',
  'shift.metric.in_route': 'В маршруте',
  'shift.metric.delivered': 'Доставлено/возврат',
  'shift.metric.problematic': 'Проблемные',
  'shift.close.title': 'Закрытие смены',
  'shift.close.body1': 'Передайте на склад оставшиеся заказы до конца смены.',
  'shift.close.body2':
      'Перед закрытием смены все недоставленные заказы будут переданы на склад для приёмки.',
  'shift.close.confirm_title': 'Закрыть смену?',
  'shift.close.confirm_body':
      'А точно ли хотите закрыть смену? Оставшиеся заказы будут переданы на склад.',
  'shift.close.confirm_yes': 'Да, закрыть',
  'shift.closed_snack': 'Смена закрыта',
  'shift.already_closed': 'Смена уже закрыта',
  'shift.close.action': 'Закрыть смену',
  'shift.status.open': 'Открыта',
  'shift.status.closing': 'Закрывается',
  'shift.status.closed': 'Закрыта',
  'shift.status.canceled': 'Отменена',

  'self_pickup.add_order': 'Добавить заказ',
  'self_pickup.scan_hint':
      'Сканируйте штрихкоды, затем нажмите «Добавить» для подтверждения с подписью.',
  'self_pickup.scan': 'Сканировать',
  'self_pickup.add': 'Добавить',
  'self_pickup.pending': 'Ожидают добавления:',
  'self_pickup.remove_from_list': 'Удалить из списка',
  'self_pickup.my_orders': 'Мои заказы (самостоятельный забор)',
  'self_pickup.none': 'Пока нет заказов самостоятельного забора',
  'self_pickup.remove_from_hands_title': 'Убрать с рук?',
  'self_pickup.remove_from_hands_body':
      'Заказ {barcode} исчезнет из «Мои задачи». Unit не удаляется — его можно будет снова добавить по скану.',
  'self_pickup.remove_from_hands': 'Убрать с рук',
  'self_pickup.removed_snack': 'Убрано с рук',
  'self_pickup.added_snack': 'Добавлено: {ok} из {total}',
  'self_pickup.warehouse_route': 'Маршрут до склада',
  'self_pickup.product': 'Товар: {name}',
  'self_pickup.partner': 'Партнер: {name}',
  'self_pickup.claimed_short': 'Взято: {dt}',

  'status.return_to_warehouse': 'Вернуть на склад',
  'status.claimed': 'Взята',
  'status.in_route': 'В маршруте',
  'status.arrived': 'Прибыл',
  'status.dropped': 'Дроп',
  'status.delivered': 'Доставлено',
  'status.returned': 'Возврат',
  'status.failed': 'Проблема',
  'status.canceled': 'Отменена',
};

const Map<String, String> _az = <String, String>{
  'app.title': 'Kuryer',
  'app.courier_fallback': 'Kuryer',
  'nav.tasks': 'Tapşırıqlar',
  'nav.pickup': 'Götürmə',
  'nav.shift': 'Növbə',
  'home.title': 'Kuryer: {name}',
  'home.queue': 'Növbə: {count}',
  'home.refresh': 'Yenilə',
  'home.privacy_policy': 'Məxfilik siyasəti',
  'home.logout': 'Çıxış',
  'lang.ru': 'RU',
  'lang.az': 'AZ',
  'task.finish_route': 'Reysi bağlamaq',

  'task.details.title': 'Tapşırıq detalları',
  'task.not_picked': 'GÖTÜRÜLMƏYİB',
  'task.source_logistics': 'Mənbə: loqistik tərəfindən təyin edilib{suffix}',
  'task.source_suffix_name': ' ({name})',
  'task.assigned_not_confirmed':
      'Sifariş loqistik tərəfindən təyin edilib, lakin kuryer hələ faktiki götürməni təsdiqləməyib.',
  'task.claimed_at': 'İşə götürüldü: {dt}',
  'task.zone': 'Zona: {zone}',
  'task.scenario': 'Ssenari: {scenario}',

  'pickup.confirm': 'Götürməni təsdiqlə',
  'pickup.reject': 'Götürülmədi',
  'self_pickup.block':
      'Özün götürmə. Yalnız növbə bağlananda təhvil verilir.',
  'drop.undo.snack': 'Drop ləğv edildi',
  'drop.undo': 'Drop-u ləğv et',
  'ops.snack.drop_sent': 'Drop OPS statusu ilə göndərildi',
  'ops.snack.status_sent': 'OPS statusu göndərildi (sifariş kuryerdə qaldı)',

  'ops.dialog.title': 'OPS statusu',
  'ops.dialog.status_required': 'Status (mütləq):',
  'ops.dialog.will_create_drop':
      'Drop nöqtəsi yaradılacaq, sifariş kuryerin əlindən çıxacaq.',
  'ops.dialog.wont_create_drop':
      'Drop nöqtəsi yaradılmır, sifariş kuryerdə qalır.',
  'ops.dialog.comment_required': 'Şərh (mütləq)',
  'ops.dialog.comment_optional': 'Şərh (opsional)',
  'ops.dialog.sig_reject_required':
      'İmtina edən tərəfin imzası (mütləq):',
  'ops.dialog.sig_accept_required':
      'Qəbul edən tərəfin imzası (mütləq):',
  'ops.dialog.sig_clear': 'İmzanı sil',
  'ops.dialog.photo_required': 'Aktın fotosu (mütləq):',
  'ops.dialog.photo_change': 'Dəyiş',
  'ops.dialog.photo_take': 'Aktın fotosunu çək',
  'common.cancel': 'Ləğv et',
  'ops.dialog.confirm_drop': 'Drop-u təsdiqlə',
  'ops.dialog.save_status': 'Statusu yadda saxla',

  'ops.rule.partner_accepted_return': 'Partnyor qaytarışı qəbul etdi',
  'ops.rule.partner_rejected_return': 'Partnyor qaytarışı qəbul etmədi',
  'ops.rule.sent_to_sc': 'SC-yə verildi',
  'ops.rule.client_accepted': 'Müştəri qəbul etdi',
  'ops.rule.client_rejected': 'Müştəri qəbul etmədi',
  'ops.rule.delivered_to_pudo': 'Məhsul PUDO-ya çatdırıldı',
  'ops.rule.postponed_1': 'Təxirə salma',
  'ops.rule.in_progress': 'İcra olunur',

  'tasks.load_error': 'Tapşırıqlar yüklənmədi:\n{error}',
  'tasks.my_tasks': 'Mənim tapşırıqlarım',
  'tasks.no_active_tasks': 'Aktiv tapşırıq yoxdur',
  'tasks.transfer_selected': 'Seçilənləri ötür ({count})',
  'tasks.pickup_confirmed': 'Götürmə təsdiqləndi',
  'tasks.transfer.title': 'Sifarişləri ötür',
  'tasks.transfer.body':
      'Seçilən sifarişlər sizin üzərinizdən götürüləcək (başqa şəxsə ötürülür). Unit silinmir — skanla yenidən əlavə etmək olar.',
  'tasks.transfer.comment_optional_hint': 'Şərh (opsional)',
  'tasks.transfer.action': 'Ötür',
  'tasks.transferred_snack': 'Ötürüldü: {count} sifariş',
  'tasks.pickup_confirmed_for': 'Götürmə təsdiqləndi: {barcode}',
  'tasks.pickup_reject_saved': 'Götürülmədi saxlanıldı',
  'tasks.pickup_reject.title': 'Götürülmədi',
  'tasks.pickup_reject.reason_hint': 'Səbəbi göstərin',
  'common.save': 'Yadda saxla',
  'tasks.pickup_reject_saved_for': 'Götürülmədi saxlanıldı: {barcode}',
  'tasks.pending.title': 'Loqistikdən tapşırıqlar — təsdiqlənməyən ({count})',
  'tasks.pending.subtitle': 'Götürməni təsdiqləyin və ya səbəb göstərərək “götürülmədi” edin',
  'tasks.pending.body':
      'Skanla təsdiqləyin və ya sifarişləri seçib kütləvi təsdiqləyin.',
  'tasks.pending.scan_label': 'Avto-təsdiq üçün ştrixkod skanı',
  'tasks.pending.scan_confirm': 'Skanla və təsdiqlə',
  'tasks.pending.none': 'Təsdiqlənməyən sifariş yoxdur',
  'tasks.pending.out_at': 'Göndərildi: {dt}',
  'tasks.pending.product': 'Məhsul: {name}',
  'tasks.pending.partner': 'Partnyor: {name}',
  'tasks.pending.scenario': 'Ssenari: {scenario}',
  'tasks.pending.confirm_bulk': 'Götürməni təsdiqlə ({count})',
  'tasks.pending.reject_bulk': 'Götürülmədi ({count})',
  'tasks.pending.not_found': 'Bu sifariş yoxdur',
  'tasks.pending.scan_confirm_title': 'Skanla və təsdiqlə',
  'tasks.pending.scan_confirm_snack': 'Skanla təsdiqləndi: {barcode}',
  'tasks.no_scenario': 'Ssenari yoxdur',
  'task.assigned_by_logistics': 'Loqistik təyin edib{suffix}',
  'task.assigned_suffix_name': ': {name}',
  'task.claimed_short': 'Götürüldü: {dt}',
  'common.open': 'Aç',

  'signature.giver.title': 'Təhvil verənin imzası',
  'signature.giver.body': 'Sifarişi verən şəxsin imzasını alın.',
  'signature.giver.clear': 'İmzanı sil',
  'signature.giver.confirm': 'Təsdiqlə',

  'gps.title': 'Tətbiq üçün GPS-i aktiv edin',
  'gps.body':
      'Kuryer tətbiqi yalnız aktiv geolokasiya ilə işləyir. Cihaz ayarlarında GPS-i aktiv edin.',
  'gps.retry': 'Yenidən yoxla',

  'login.supabase_not_configured':
      'Supabase qurulmayıb. SUPABASE_URL və SUPABASE_ANON_KEY-ni --dart-define ilə verin.',
  'login.session_expired': 'Sessiya bitdi. Yenidən daxil olun.',
  'login.failed': 'Daxil olmaq alınmadı',
  'login.title': 'Kuryer',
  'login.email': 'E-poçt',
  'login.email_invalid': 'Düzgün e-poçt daxil edin',
  'login.password': 'Şifrə',
  'login.password_short': 'Şifrə çox qısadır',
  'login.remember': 'Girişi yadda saxla',
  'login.start_shift': 'Növbəyə başla',
  'login.privacy_policy': 'Məxfilik siyasəti',

  'shift.current.title': 'Cari növbə',
  'shift.current.none': 'Açıq növbə tapılmadı',
  'shift.current.id': 'Növbə ID: {id}',
  'shift.current.status': 'Status: {status}',
  'shift.current.started': 'Başladı: {dt}',
  'shift.current.active_tasks': 'Aktiv tapşırıqlar: {count}',
  'shift.summary.title': 'Növbə xülasəsi',
  'shift.metric.assigned': 'Təyin edilib',
  'shift.metric.in_route': 'Marşrutda',
  'shift.metric.delivered': 'Çatdırılıb/qaytarış',
  'shift.metric.problematic': 'Problemli',
  'shift.close.title': 'Növbənin bağlanması',
  'shift.close.body1': 'Növbə bitənədək qalan sifarişləri anbara təhvil verin.',
  'shift.close.body2':
      'Növbə bağlanmazdan əvvəl çatdırılmayan sifarişlər qəbul üçün anbara ötürüləcək.',
  'shift.close.confirm_title': 'Növbə bağlansın?',
  'shift.close.confirm_body':
      'Növbəni bağlamaq istədiyinizə əminsiniz? Qalan sifarişlər anbara ötürüləcək.',
  'shift.close.confirm_yes': 'Bəli, bağla',
  'shift.closed_snack': 'Növbə bağlandı',
  'shift.already_closed': 'Növbə artıq bağlanıb',
  'shift.close.action': 'Növbəni bağla',
  'shift.status.open': 'Açıq',
  'shift.status.closing': 'Bağlanır',
  'shift.status.closed': 'Bağlı',
  'shift.status.canceled': 'Ləğv edilib',

  'self_pickup.add_order': 'Sifariş əlavə et',
  'self_pickup.scan_hint':
      'Ştrixkodları skan edin, sonra imza ilə təsdiq üçün “Əlavə et” düyməsinə basın.',
  'self_pickup.scan': 'Skan et',
  'self_pickup.add': 'Əlavə et',
  'self_pickup.pending': 'Əlavə olunma gözləyənlər:',
  'self_pickup.remove_from_list': 'Siyahıdan sil',
  'self_pickup.my_orders': 'Mənim sifarişlərim (özün götürmə)',
  'self_pickup.none': 'Özün götürmə sifarişi yoxdur',
  'self_pickup.remove_from_hands_title': 'Üzərinizdən götürülsün?',
  'self_pickup.remove_from_hands_body':
      '{barcode} sifarişi “Mənim tapşırıqlarım”dan çıxacaq. Unit silinmir — skanla yenidən əlavə etmək olar.',
  'self_pickup.remove_from_hands': 'Üzərimdən götür',
  'self_pickup.removed_snack': 'Üzərinizdən götürüldü',
  'self_pickup.added_snack': 'Əlavə edildi: {ok} / {total}',
  'self_pickup.warehouse_route': 'Anbara marşrut',
  'self_pickup.product': 'Məhsul: {name}',
  'self_pickup.partner': 'Partnyor: {name}',
  'self_pickup.claimed_short': 'Götürüldü: {dt}',

  'status.return_to_warehouse': 'Anbara qaytar',
  'status.claimed': 'Üzərindədir',
  'status.in_route': 'Marşrutda',
  'status.arrived': 'Çatdı',
  'status.dropped': 'Drop',
  'status.delivered': 'Çatdırıldı',
  'status.returned': 'Qaytarış',
  'status.failed': 'Problem',
  'status.canceled': 'Ləğv edilib',
};

String tr(String template, Map<String, Object?> vars) {
  var out = template;
  for (final entry in vars.entries) {
    out = out.replaceAll('{${entry.key}}', '${entry.value ?? ''}');
  }
  return out;
}

