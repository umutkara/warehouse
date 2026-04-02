import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../network/api_client.dart';

/// Ключ для очереди location-ping из фонового режима (отдельный isolate).
const String _bgLocationKey = 'offline_location_pings_v1';

class OfflineEventQueue {
  OfflineEventQueue({required ApiClient apiClient}) : _apiClient = apiClient;

  static const _storageKey = 'offline_event_queue_v1';
  final ApiClient _apiClient;

  Future<void> enqueue({
    required String path,
    required Map<String, dynamic> payload,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final queue = await _readQueue(prefs);
    queue.add({
      'path': path,
      'payload': payload,
      'createdAt': DateTime.now().toIso8601String(),
    });
    await prefs.setString(_storageKey, jsonEncode(queue));
  }

  /// Добавить location ping из фоновой задачи (isolate). Можно вызывать без ApiClient.
  static Future<void> enqueueLocationFromBackground(Map<String, dynamic> payload) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_bgLocationKey);
    final list = raw != null && raw.isNotEmpty
        ? (jsonDecode(raw) as List).whereType<Map>().map((x) => x.cast<String, dynamic>()).toList()
        : <Map<String, dynamic>>[];
    list.add({
      'path': '/api/courier/location/ping',
      'payload': payload,
      'createdAt': DateTime.now().toIso8601String(),
    });
    await prefs.setString(_bgLocationKey, jsonEncode(list));
  }

  Future<int> pendingCount() async {
    final prefs = await SharedPreferences.getInstance();
    final queue = await _readQueue(prefs);
    final bgRaw = prefs.getString(_bgLocationKey);
    final bgCount = bgRaw != null && bgRaw.isNotEmpty
        ? (jsonDecode(bgRaw) as List).length
        : 0;
    return queue.length + bgCount;
  }

  Future<void> flush() async {
    final prefs = await SharedPreferences.getInstance();
    var queue = await _readQueue(prefs);
    final bgRaw = prefs.getString(_bgLocationKey);
    if (bgRaw != null && bgRaw.isNotEmpty) {
      final bgList = (jsonDecode(bgRaw) as List)
          .whereType<Map>()
          .map((x) => x.cast<String, dynamic>())
          .toList();
      queue = [...queue, ...bgList];
      await prefs.remove(_bgLocationKey);
    }
    if (queue.isEmpty) return;

    final remaining = <Map<String, dynamic>>[];
    for (final item in queue) {
      try {
        await _apiClient.postJson(
          item['path']?.toString() ?? '',
          body: (item['payload'] as Map?)?.cast<String, dynamic>() ?? {},
        );
      } on ApiException {
        // Server rejected the payload; keep offline queue for actual connectivity failures only.
      } catch (_) {
        remaining.add(item);
      }
    }

    await prefs.setString(_storageKey, jsonEncode(remaining));
  }

  Future<List<Map<String, dynamic>>> _readQueue(SharedPreferences prefs) async {
    final raw = prefs.getString(_storageKey);
    if (raw == null || raw.isEmpty) return [];
    final decoded = jsonDecode(raw);
    if (decoded is! List) return [];
    return decoded.whereType<Map>().map((x) => x.cast<String, dynamic>()).toList();
  }
}
