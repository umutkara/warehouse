class CurrentShift {
  const CurrentShift({
    required this.id,
    required this.status,
    required this.startedAt,
    this.closedAt,
    this.activeTasks = 0,
    this.totalTasks = 0,
    this.problematicTasks = 0,
    this.lastLat,
    this.lastLng,
  });

  final String id;
  final String status;
  final DateTime startedAt;
  final DateTime? closedAt;
  final int activeTasks;
  final int totalTasks;
  final int problematicTasks;
  final double? lastLat;
  final double? lastLng;

  factory CurrentShift.fromApi(
    Map<String, dynamic> map,
    Map<String, dynamic>? metrics, {
    Map<String, dynamic>? lastLocation,
  }) {
    return CurrentShift(
      id: map['id']?.toString() ?? '',
      status: map['status']?.toString() ?? 'open',
      startedAt:
          DateTime.tryParse(map['started_at']?.toString() ?? '') ??
          DateTime.now(),
      closedAt: DateTime.tryParse(map['closed_at']?.toString() ?? ''),
      activeTasks: (metrics?['active_tasks'] as num?)?.toInt() ?? 0,
      totalTasks: (metrics?['total_tasks'] as num?)?.toInt() ?? 0,
      problematicTasks: (metrics?['problematic_tasks'] as num?)?.toInt() ?? 0,
      lastLat: (lastLocation?['lat'] as num?)?.toDouble(),
      lastLng: (lastLocation?['lng'] as num?)?.toDouble(),
    );
  }

  CurrentShift copyWith({
    String? id,
    String? status,
    DateTime? startedAt,
    DateTime? closedAt,
    int? activeTasks,
    int? totalTasks,
    int? problematicTasks,
    double? lastLat,
    double? lastLng,
  }) {
    return CurrentShift(
      id: id ?? this.id,
      status: status ?? this.status,
      startedAt: startedAt ?? this.startedAt,
      closedAt: closedAt ?? this.closedAt,
      activeTasks: activeTasks ?? this.activeTasks,
      totalTasks: totalTasks ?? this.totalTasks,
      problematicTasks: problematicTasks ?? this.problematicTasks,
      lastLat: lastLat ?? this.lastLat,
      lastLng: lastLng ?? this.lastLng,
    );
  }
}
