import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';

import '../offline/offline_event_queue.dart';

/// Обработчик фоновой задачи: сбор геолокации каждые 30 сек при офлайне.
@pragma('vm:entry-point')
void startOfflineLocationTask() {
  FlutterForegroundTask.setTaskHandler(OfflineLocationTaskHandler());
}

@pragma('vm:entry-point')
class OfflineLocationTaskHandler extends TaskHandler {
  @override
  void onRepeatEvent(DateTime timestamp) {
    _collectAndEnqueue();
  }

  Future<void> _collectAndEnqueue() async {
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium),
      );
      final payload = <String, dynamic>{
        'lat': position.latitude,
        'lng': position.longitude,
        'recordedAt': position.timestamp.toIso8601String(),
        'accuracy': position.accuracy,
        'zoneId': null,
        'speed': position.speed.isFinite && position.speed >= 0 ? position.speed : null,
        'heading': position.heading.isFinite && position.heading >= 0 ? position.heading : null,
      };
      await OfflineEventQueue.enqueueLocationFromBackground(payload);
    } catch (_) {
      // Игнорируем ошибки — следующая итерация попробует снова
    }
  }

  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {}

  @override
  Future<void> onDestroy(DateTime timestamp) async {}

  @override
  void onReceiveData(Object data) {}

  @override
  void onNotificationButtonPressed(String id) {}

  @override
  void onNotificationPressed() {}

  @override
  void onNotificationDismissed() {}
}
