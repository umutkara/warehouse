class TaskPoolItem {
  const TaskPoolItem({
    required this.id,
    required this.unitId,
    required this.barcode,
    required this.priority,
    required this.availableFrom,
    this.zoneId,
  });

  final String id;
  final String unitId;
  final String barcode;
  final int priority;
  final DateTime availableFrom;
  final String? zoneId;

  factory TaskPoolItem.fromApi(Map<String, dynamic> map) {
    final unit = map['unit'] as Map<String, dynamic>?;
    return TaskPoolItem(
      id: map['id']?.toString() ?? '',
      unitId: map['unit_id']?.toString() ?? '',
      barcode:
          unit?['barcode']?.toString() ?? map['unit_id']?.toString() ?? 'N/A',
      priority: (map['priority'] as num?)?.toInt() ?? 0,
      availableFrom:
          DateTime.tryParse(map['available_from']?.toString() ?? '') ??
          DateTime.now(),
      zoneId: map['zone_id']?.toString(),
    );
  }
}
