import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';
import 'package:uuid/uuid.dart';

import '../../../core/background/offline_location_task.dart';
import '../../../core/network/api_client.dart';
import '../../../core/offline/offline_event_queue.dart';
import '../../map/domain/geo_models.dart';
import '../../shift/domain/current_shift.dart';
import '../../shift/domain/shift_summary.dart';
import '../../tasks/data/task_repository.dart';
import '../../tasks/domain/courier_task.dart';
import '../../tasks/domain/pending_assignment.dart';

class CourierAppController extends ChangeNotifier {
  CourierAppController({
    required ApiClient apiClient,
    TaskRepository? taskRepository,
  }) : _taskRepository = taskRepository ?? TaskRepository(apiClient: apiClient),
       _eventQueue = OfflineEventQueue(apiClient: apiClient);

  final TaskRepository _taskRepository;
  final OfflineEventQueue _eventQueue;
  final _uuid = const Uuid();
  StreamSubscription<Position>? _positionSubscription;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  Timer? _offlineLocationTimer;
  bool _isOnline = true;
  bool _foregroundTaskInit = false;
  DateTime? _lastLocationSentAt;
  _LocationPingSnapshot? _lastLocationSnapshot;
  static const Duration _minPingInterval = Duration(seconds: 10);
  static const Duration _offlineLocationInterval = Duration(seconds: 15);
  static const double _minPingDistanceMeters = 20;
  static const double _maxAcceptedAccuracyMeters = 80;
  static const Set<String> _dropOpsStatuses = <String>{
    'partner_accepted_return',
    'sent_to_sc',
    'client_accepted',
    'delivered_to_pudo',
  };

  bool loading = false;
  String? error;
  String courierName = '';
  String? trackingStatus;
  CurrentShift? currentShift;
  int pendingQueueCount = 0;
  final List<CourierTask> tasks = [];
  final List<PendingAssignment> pendingAssignments = [];
  final List<GeoZone> zones = [];
  final List<DropMarker> drops = [];
  final List<GeoPoint> routePoints = [];

  ShiftSummary get summary => ShiftSummary.fromTasks(
    tasks: tasks,
    pendingLogisticsAssignments: pendingAssignments.length,
    problematic: currentShift?.problematicTasks ?? 0,
  );

  Future<void> bootstrap({required String initialCourierName}) async {
    courierName = initialCourierName.trim();
    await _taskRepository.startShift();
    await refreshAll();
    await ensureLiveTracking();
    _initConnectivityAndForegroundTask();
  }

  void _initConnectivityAndForegroundTask() {
    if (_foregroundTaskInit) return;
    _foregroundTaskInit = true;

    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'courier_offline_location',
        channelName: 'Oflayn geolokasiya',
        channelDescription:
            'İnternet olmadıqda tətbiq məkan məlumatını toplayır',
        onlyAlertOnce: true,
      ),
      iosNotificationOptions: const IOSNotificationOptions(
        showNotification: true,
        playSound: false,
      ),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.repeat(
          _offlineLocationInterval.inMilliseconds,
        ),
        allowWakeLock: true,
        allowWifiLock: true,
      ),
    );

    _connectivitySubscription = Connectivity().onConnectivityChanged.listen(
      _onConnectivityChanged,
    );
    Connectivity().checkConnectivity().then(_onConnectivityChanged);
  }

  void _onConnectivityChanged(List<ConnectivityResult> results) {
    final wasOnline = _isOnline;
    _isOnline = results.any((r) => r != ConnectivityResult.none);
    if (wasOnline == _isOnline) return;
    if (_isOnline) {
      _stopOfflineLocationCollection();
      _eventQueue.flush().then((_) async {
        pendingQueueCount = await _eventQueue.pendingCount();
        notifyListeners();
      });
    } else {
      _startOfflineLocationCollection();
    }
  }

  Future<void> _startOfflineLocationCollection() async {
    _offlineLocationTimer?.cancel();
    _offlineLocationTimer = null;

    if (currentShift == null) return;

    if (Platform.isAndroid || Platform.isIOS) {
      try {
        if (Platform.isAndroid) {
          final perm =
              await FlutterForegroundTask.checkNotificationPermission();
          if (perm != NotificationPermission.granted) {
            await FlutterForegroundTask.requestNotificationPermission();
          }
        }
        await FlutterForegroundTask.startService(
          notificationTitle: 'Kuryer',
          notificationText: 'İnternet olmadıqda geolokasiya toplanır',
          serviceId: 256,
          callback: startOfflineLocationTask,
        );
      } catch (_) {
        _startOfflineTimerInApp();
      }
    } else {
      _startOfflineTimerInApp();
    }
  }

  void _startOfflineTimerInApp() {
    _offlineLocationTimer?.cancel();
    _offlineLocationTimer = Timer.periodic(
      _offlineLocationInterval,
      (_) => _collectLocationForOffline(),
    );
  }

  Future<void> _collectLocationForOffline() async {
    if (_isOnline) return;
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
        ),
      );
      final zoneId = _resolveZoneId(
        lat: position.latitude,
        lng: position.longitude,
      );
      await OfflineEventQueue.enqueueLocationFromBackground({
        'lat': position.latitude,
        'lng': position.longitude,
        'recordedAt': position.timestamp.toIso8601String(),
        'accuracy': position.accuracy,
        'zoneId': zoneId,
        'speed': position.speed.isFinite && position.speed >= 0
            ? position.speed
            : null,
        'heading': position.heading.isFinite && position.heading >= 0
            ? position.heading
            : null,
      });
      pendingQueueCount = await _eventQueue.pendingCount();
      notifyListeners();
    } catch (_) {}
  }

  Future<void> _stopOfflineLocationCollection() async {
    _offlineLocationTimer?.cancel();
    _offlineLocationTimer = null;
    try {
      await FlutterForegroundTask.stopService();
    } catch (_) {}
  }

  Future<void> refreshAll() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      await _eventQueue.flush();
      pendingQueueCount = await _eventQueue.pendingCount();
      currentShift = await _taskRepository.loadCurrentShift();
      final result = await _taskRepository.fetchMyTasks();
      final assigned = await _taskRepository.fetchPendingAssignments();
      final loadedZones = await _taskRepository.fetchZones();
      final loadedDrops = await _taskRepository.fetchDrops();
      tasks
        ..clear()
        ..addAll(result);
      pendingAssignments
        ..clear()
        ..addAll(assigned);
      zones
        ..clear()
        ..addAll(loadedZones);
      drops
        ..clear()
        ..addAll(loadedDrops);
    } catch (e) {
      error = e.toString();
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> refreshTasks() => refreshAll();

  Future<void> claimTaskByBarcode(
    String barcode, {
    required String giverSignature,
    String? note,
  }) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      await _taskRepository.claimByBarcode(
        barcode: barcode,
        giverSignature: giverSignature,
        note: note,
      );
      await refreshAll();
    } catch (e) {
      error = e.toString();
      loading = false;
      notifyListeners();
    }
  }

  /// Добавляет несколько заказов оптом. Возвращает число успешно добавленных.
  Future<int> claimTasksByBarcodes(
    List<String> barcodes, {
    required String giverSignature,
    String? note,
  }) async {
    if (barcodes.isEmpty) return 0;
    loading = true;
    error = null;
    notifyListeners();
    var successCount = 0;
    try {
      for (final barcode in barcodes) {
        try {
          await _taskRepository.claimByBarcode(
            barcode: barcode,
            giverSignature: giverSignature,
            note: note,
          );
          successCount++;
        } catch (_) {}
      }
      await refreshAll();
    } finally {
      loading = false;
      notifyListeners();
    }
    return successCount;
  }

  Future<void> removeTaskFromHands(CourierTask task, {String? reason}) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      await _taskRepository.removeFromHands(task, reason: reason);
      await refreshAll();
    } catch (e) {
      error = e.toString();
      loading = false;
      notifyListeners();
    }
  }

  /// Массово убирает выбранные задачи с рук (передача другому лицу).
  Future<int> removeTasksFromHandsBulk({
    required List<String> taskIds,
    String? reason,
  }) async {
    if (taskIds.isEmpty) return 0;
    loading = true;
    error = null;
    notifyListeners();
    try {
      final count = await _taskRepository.removeFromHandsBulk(
        taskIds: taskIds,
        reason: reason,
      );
      await refreshAll();
      return count;
    } catch (e) {
      error = e.toString();
      return 0;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> confirmPendingAssignments({
    required List<String> shipmentIds,
    String? giverSignature,
    String? note,
  }) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      await _taskRepository.confirmAssignments(
        shipmentIds: shipmentIds,
        giverSignature: giverSignature,
        note: note,
      );
      await refreshAll();
    } catch (e) {
      error = e.toString();
      loading = false;
      notifyListeners();
    }
  }

  Future<void> rejectPendingAssignments({
    required List<String> shipmentIds,
    required String note,
  }) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      await _taskRepository.rejectAssignments(
        shipmentIds: shipmentIds,
        note: note,
      );
      await refreshAll();
    } catch (e) {
      error = e.toString();
      loading = false;
      notifyListeners();
    }
  }

  Future<void> scanConfirmAssignment(
    String barcode, {
    String? giverSignature,
    String? note,
  }) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      await _taskRepository.scanConfirmAssignment(
        barcode: barcode,
        giverSignature: giverSignature,
        note: note,
      );
      await refreshAll();
    } on ApiException catch (e) {
      error = e.toString();
      loading = false;
      notifyListeners();
    } catch (e) {
      error = e.toString();
      loading = false;
      notifyListeners();
    }
  }

  Future<void> sendLocationPing({
    required double lat,
    required double lng,
  }) async {
    final zoneId = _resolveZoneId(lat: lat, lng: lng);
    final recordedAt = DateTime.now();
    try {
      await _taskRepository.pingLocation(
        lat: lat,
        lng: lng,
        zoneId: zoneId,
        recordedAt: recordedAt,
      );
      _rememberSentLocation(
        at: recordedAt,
        point: GeoPoint(lat: lat, lng: lng),
        zoneId: zoneId,
      );
    } catch (_) {
      await _eventQueue.enqueue(
        path: '/api/courier/location/ping',
        payload: {
          'lat': lat,
          'lng': lng,
          'zoneId': zoneId,
          'recordedAt': recordedAt.toIso8601String(),
        },
      );
      pendingQueueCount = await _eventQueue.pendingCount();
      notifyListeners();
    }
  }

  Future<void> markTaskDelivered(CourierTask task, {String? note}) async {
    await _sendTaskEventWithFallback(
      task: task,
      eventType: 'delivered',
      note: note,
      proof: {'source': 'mobile'},
    );
  }

  Future<void> markTaskDropped(
    CourierTask task, {
    required String opsStatus,
    String? note,
    String? signaturePngBase64,
    List<int>? photoBytes,
    String? photoFileName,
    String? actPhotoUrl,
  }) async {
    double? lat;
    double? lng;
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
        ),
      );
      lat = pos.latitude;
      lng = pos.longitude;
    } catch (_) {
      final last = _lastLocationSnapshot;
      if (last != null) {
        lat = last.point.lat;
        lng = last.point.lng;
      }
    }

    String? photoUrl = actPhotoUrl;
    if (photoUrl == null &&
        photoBytes != null &&
        photoBytes.isNotEmpty &&
        task.unitId.isNotEmpty) {
      try {
        final resp = await _taskRepository.uploadDropPhoto(
          unitId: task.unitId,
          photoBytes: photoBytes,
          fileName: photoFileName ?? 'drop_act.jpg',
        );
        photoUrl = resp['url']?.toString();
      } catch (e) {
        rethrow;
      }
    }

    final proof = <String, dynamic>{'source': 'mobile'};
    if (signaturePngBase64 != null && signaturePngBase64.isNotEmpty) {
      proof['receiver_signature'] = signaturePngBase64;
    }
    if (photoUrl != null && photoUrl.isNotEmpty) {
      proof['act_photo_url'] = photoUrl;
    }

    final eventType = _dropOpsStatuses.contains(opsStatus)
        ? 'dropped'
        : 'ops_status_update';

    await _sendTaskEventWithFallback(
      task: task,
      eventType: eventType,
      opsStatus: opsStatus,
      note: note,
      lat: lat,
      lng: lng,
      proof: proof,
    );
  }

  Future<void> undoTaskDrop(CourierTask task) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      await _taskRepository.undoDrop(task);
      await refreshAll();
    } catch (e) {
      error = e.toString();
      loading = false;
      notifyListeners();
      rethrow;
    }
    loading = false;
    notifyListeners();
  }

  Future<void> markTaskFailed(
    CourierTask task, {
    required String reason,
    String? note,
  }) async {
    await _sendTaskEventWithFallback(
      task: task,
      eventType: 'failed',
      note: note,
      failReason: reason,
    );
  }

  Future<void> _sendTaskEventWithFallback({
    required CourierTask task,
    required String eventType,
    String? opsStatus,
    String? note,
    String? failReason,
    double? lat,
    double? lng,
    Map<String, dynamic>? proof,
  }) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      await _taskRepository.sendTaskEvent(
        task: task,
        eventType: eventType,
        eventId: _uuid.v4(),
        opsStatus: opsStatus,
        note: note,
        lat: lat,
        lng: lng,
        failReason: failReason,
        proof: proof,
      );
      await refreshAll();
    } on ApiException catch (e) {
      error = e.toString();
      loading = false;
      notifyListeners();
      rethrow;
    } catch (e) {
      await _eventQueue.enqueue(
        path: '/api/courier/tasks/${task.id}/event',
        payload: {
          'eventType': eventType,
          'eventId': _uuid.v4(),
          'opsStatus': opsStatus,
          'note': note,
          'lat': lat,
          'lng': lng,
          'failReason': failReason,
          'proof': proof ?? {},
        },
      );
      pendingQueueCount = await _eventQueue.pendingCount();
      error = 'Oflayn saxlanıldı: $eventType';
      loading = false;
      notifyListeners();
    }
  }

  Future<void> startHandover({String? note}) async {
    await _taskRepository.startHandover(note: note);
    await refreshAll();
  }

  Future<void> closeShift({bool force = false, String? note}) async {
    await stopLiveTracking();
    await _taskRepository.closeShift(force: force, note: note);
    await refreshAll();
  }

  Future<void> ensureLiveTracking() async {
    if (_positionSubscription != null) return;
    final isLocationEnabled = await Geolocator.isLocationServiceEnabled();
    if (!isLocationEnabled) {
      trackingStatus = 'Cihazda GPS-i aktiv edin';
      notifyListeners();
      return;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      trackingStatus = 'Geolokasiya icazəsi yoxdur';
      notifyListeners();
      return;
    }

    trackingStatus = 'GPS izləmə aktivdir';
    notifyListeners();
    const settings = LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10,
    );
    _positionSubscription =
        Geolocator.getPositionStream(locationSettings: settings).listen(
          (position) {
            _onPosition(position);
          },
          onError: (Object e) {
            trackingStatus = 'GPS xətası: $e';
            notifyListeners();
          },
        );
  }

  Future<void> stopLiveTracking() async {
    await _positionSubscription?.cancel();
    _positionSubscription = null;
    trackingStatus = 'GPS izləmə dayandırıldı';
    notifyListeners();
  }

  Future<void> _onPosition(Position position) async {
    final point = GeoPoint(lat: position.latitude, lng: position.longitude);
    routePoints.add(point);
    if (routePoints.length > 500) {
      routePoints.removeRange(0, routePoints.length - 500);
    }

    final zoneId = _resolveZoneId(lat: point.lat, lng: point.lng);
    final now = DateTime.now();
    if (!_shouldSendLocation(
      now: now,
      point: point,
      zoneId: zoneId,
      accuracy: position.accuracy,
    )) {
      notifyListeners();
      return;
    }

    final safeSpeed = position.speed.isFinite && position.speed >= 0
        ? position.speed
        : null;
    final safeHeading = position.heading.isFinite && position.heading >= 0
        ? position.heading
        : null;
    final recordedAt = position.timestamp;

    try {
      await _taskRepository.pingLocation(
        lat: point.lat,
        lng: point.lng,
        zoneId: zoneId,
        recordedAt: recordedAt,
        accuracy: position.accuracy,
        speed: safeSpeed,
        heading: safeHeading,
      );
    } catch (_) {
      await _eventQueue.enqueue(
        path: '/api/courier/location/ping',
        payload: {
          'lat': point.lat,
          'lng': point.lng,
          'zoneId': zoneId,
          'recordedAt': recordedAt.toIso8601String(),
          'accuracy': position.accuracy,
          'speed': safeSpeed,
          'heading': safeHeading,
        },
      );
      pendingQueueCount = await _eventQueue.pendingCount();
    }

    _rememberSentLocation(at: now, point: point, zoneId: zoneId);
    currentShift = currentShift?.copyWith(
      lastLat: point.lat,
      lastLng: point.lng,
    );
    notifyListeners();
  }

  bool _shouldSendLocation({
    required DateTime now,
    required GeoPoint point,
    required String? zoneId,
    required double accuracy,
  }) {
    if (accuracy.isFinite && accuracy > _maxAcceptedAccuracyMeters)
      return false;
    final snapshot = _lastLocationSnapshot;
    if (snapshot == null || _lastLocationSentAt == null) return true;
    if (snapshot.zoneId != zoneId) return true;
    if (now.difference(_lastLocationSentAt!) >= _minPingInterval) return true;
    final distance = Geolocator.distanceBetween(
      snapshot.point.lat,
      snapshot.point.lng,
      point.lat,
      point.lng,
    );
    return distance >= _minPingDistanceMeters;
  }

  void _rememberSentLocation({
    required DateTime at,
    required GeoPoint point,
    required String? zoneId,
  }) {
    _lastLocationSentAt = at;
    _lastLocationSnapshot = _LocationPingSnapshot(point: point, zoneId: zoneId);
  }

  String? _resolveZoneId({required double lat, required double lng}) {
    for (final zone in zones) {
      if (zone.polygon.length < 3) continue;
      if (_pointInPolygon(lat: lat, lng: lng, polygon: zone.polygon)) {
        return zone.id;
      }
    }
    return null;
  }

  bool _pointInPolygon({
    required double lat,
    required double lng,
    required List<GeoPoint> polygon,
  }) {
    var inside = false;
    for (int i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      final yi = polygon[i].lat;
      final xi = polygon[i].lng;
      final yj = polygon[j].lat;
      final xj = polygon[j].lng;

      final intersects =
          ((yi > lat) != (yj > lat)) &&
          (lng <
              (xj - xi) * (lat - yi) / ((yj - yi) == 0 ? 1e-12 : (yj - yi)) +
                  xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  @override
  void dispose() {
    _positionSubscription?.cancel();
    _connectivitySubscription?.cancel();
    _offlineLocationTimer?.cancel();
    _stopOfflineLocationCollection();
    super.dispose();
  }
}

class _LocationPingSnapshot {
  const _LocationPingSnapshot({required this.point, required this.zoneId});

  final GeoPoint point;
  final String? zoneId;
}
