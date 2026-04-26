import '../../../core/network/api_client.dart';
import '../../map/domain/geo_models.dart';
import '../../shift/domain/current_shift.dart';
import '../domain/courier_task.dart';
import '../domain/pending_assignment.dart';

class TaskRepository {
  TaskRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  String _imageContentTypeForFileName(String fileName) {
    final normalized = fileName.toLowerCase();
    if (normalized.endsWith('.png')) return 'image/png';
    if (normalized.endsWith('.webp')) return 'image/webp';
    if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    return 'image/jpeg';
  }

  Future<CurrentShift?> loadCurrentShift() async {
    final response = await _apiClient.getJson('/api/courier/shift/current');
    final shift = response['shift'];
    if (shift is! Map<String, dynamic>) return null;
    final metrics = response['metrics'] as Map<String, dynamic>?;
    final lastLocation = response['last_location'] as Map<String, dynamic>?;
    return CurrentShift.fromApi(shift, metrics, lastLocation: lastLocation);
  }

  Future<void> startShift() async {
    await _apiClient.postJson('/api/courier/shift/start', body: {});
  }

  Future<void> closeShift({required bool force, String? note}) async {
    await _apiClient.postJson(
      '/api/courier/shift/close',
      body: {'force': force, 'note': note},
    );
  }

  Future<void> claimByBarcode({
    required String barcode,
    required String giverSignature,
    String? note,
  }) async {
    await _apiClient.postJson(
      '/api/courier/tasks/scan-claim',
      body: <String, dynamic>{
        'barcode': barcode,
        'giver_signature': giverSignature,
        'note': note,
      },
    );
  }

  Future<List<CourierTask>> fetchMyTasks() async {
    final response = await _apiClient.getJson('/api/courier/tasks/my');
    final raw = (response['tasks'] as List<dynamic>? ?? []);
    return raw
        .whereType<Map<String, dynamic>>()
        .map(CourierTask.fromApi)
        .toList();
  }

  Future<List<PendingAssignment>> fetchPendingAssignments() async {
    final response = await _apiClient.getJson(
      '/api/courier/assignments/pending',
    );
    final raw = (response['assignments'] as List<dynamic>? ?? []);
    return raw
        .whereType<Map<String, dynamic>>()
        .map(PendingAssignment.fromApi)
        .toList();
  }

  Future<void> confirmAssignments({
    required List<String> shipmentIds,
    String? giverSignature,
    String? note,
  }) async {
    final body = <String, dynamic>{
      'shipmentIds': shipmentIds,
      if (giverSignature?.isNotEmpty == true) 'giver_signature': giverSignature,
      'note': note,
    };
    await _apiClient.postJson('/api/courier/assignments/confirm', body: body);
  }

  Future<void> rejectAssignments({
    required List<String> shipmentIds,
    required String note,
  }) async {
    await _apiClient.postJson(
      '/api/courier/assignments/reject',
      body: <String, dynamic>{'shipmentIds': shipmentIds, 'note': note},
    );
  }

  Future<void> scanConfirmAssignment({
    required String barcode,
    String? giverSignature,
    String? note,
  }) async {
    final body = <String, dynamic>{
      'barcode': barcode,
      if (giverSignature?.isNotEmpty == true) 'giver_signature': giverSignature,
      'note': note,
    };
    await _apiClient.postJson(
      '/api/courier/assignments/scan-confirm',
      body: body,
    );
  }

  Future<void> undoDrop(CourierTask task) async {
    await _apiClient.postJson(
      '/api/courier/tasks/${task.id}/drop/undo',
      body: {},
    );
  }

  Future<void> removeFromHands(CourierTask task, {String? reason}) async {
    await _apiClient.postJson(
      '/api/courier/tasks/${task.id}/remove-from-hands',
      body: reason != null ? {'reason': reason} : {},
    );
  }

  /// Массово убирает задачи с рук (передача другому лицу).
  Future<int> removeFromHandsBulk({
    required List<String> taskIds,
    String? reason,
  }) async {
    if (taskIds.isEmpty) return 0;
    final response = await _apiClient.postJson(
      '/api/courier/tasks/remove-from-hands-batch',
      body: <String, dynamic>{
        'taskIds': taskIds,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      },
    );
    return (response['processed'] as int?) ?? 0;
  }

  Future<Map<String, dynamic>> uploadDropPhoto({
    required String unitId,
    required List<int> photoBytes,
    required String fileName,
  }) async {
    return _apiClient.postMultipart(
      '/api/courier/units/$unitId/upload-drop-photo',
      fileField: 'photo',
      fileBytes: photoBytes,
      fileName: fileName,
      contentType: _imageContentTypeForFileName(fileName),
    );
  }

  Future<void> sendTaskEvent({
    required CourierTask task,
    required String eventType,
    required String eventId,
    String? note,
    String? opsStatus,
    double? lat,
    double? lng,
    String? failReason,
    Map<String, dynamic>? proof,
  }) async {
    await _apiClient.postJson(
      '/api/courier/tasks/${task.id}/event',
      body: {
        'eventType': eventType,
        'eventId': eventId,
        'note': note,
        'opsStatus': opsStatus,
        'lat': lat,
        'lng': lng,
        'failReason': failReason,
        'proof': proof ?? <String, dynamic>{},
      },
    );
  }

  Future<void> pingLocation({
    required double lat,
    required double lng,
    String? zoneId,
    DateTime? recordedAt,
    double? accuracy,
    double? speed,
    double? heading,
    double? batteryLevel,
  }) async {
    await _apiClient.postJson(
      '/api/courier/location/ping',
      body: {
        'lat': lat,
        'lng': lng,
        'zoneId': zoneId,
        'recordedAt': recordedAt?.toIso8601String(),
        'accuracy': accuracy,
        'speed': speed,
        'heading': heading,
        'batteryLevel': batteryLevel,
      },
    );
  }

  Future<void> startHandover({String? note}) async {
    await _apiClient.postJson(
      '/api/courier/handover/start',
      body: {'note': note},
    );
  }

  Future<List<GeoZone>> fetchZones() async {
    final response = await _apiClient.getJson('/api/courier/zones');
    final rows = (response['zones'] as List<dynamic>? ?? []);
    return rows.whereType<Map<String, dynamic>>().map(GeoZone.fromApi).toList();
  }

  Future<List<DropMarker>> fetchDrops() async {
    try {
      final response = await _apiClient.getJson(
        '/api/courier/warehouse/drops?days=3',
      );
      final rows = (response['drops'] as List<dynamic>? ?? []);
      final result = <DropMarker>[];
      for (final row in rows.whereType<Map<String, dynamic>>()) {
        final rawLat = row['lat'];
        final rawLng = row['lng'];
        final lat = rawLat is num
            ? rawLat.toDouble()
            : (rawLat != null ? double.tryParse(rawLat.toString()) : null);
        final lng = rawLng is num
            ? rawLng.toDouble()
            : (rawLng != null ? double.tryParse(rawLng.toString()) : null);
        if (lat == null || lng == null || !lat.isFinite || !lng.isFinite)
          continue;
        final unit = row['unit'] as Map<String, dynamic>?;
        result.add(
          DropMarker(
            taskId: row['task_id']?.toString() ?? '',
            unitBarcode: unit?['barcode']?.toString() ?? 'N/A',
            happenedAt:
                DateTime.tryParse(row['happened_at']?.toString() ?? '') ??
                DateTime.now(),
            point: GeoPoint(lat: lat, lng: lng),
          ),
        );
      }
      return result;
    } on ApiException catch (error) {
      if (error.statusCode == 403) {
        return [];
      }
      rethrow;
    }
  }
}
