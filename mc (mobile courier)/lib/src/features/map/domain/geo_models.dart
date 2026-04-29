class GeoZone {
  const GeoZone({
    required this.id,
    required this.name,
    required this.code,
    required this.polygon,
  });

  final String id;
  final String name;
  final String code;
  final List<GeoPoint> polygon;

  factory GeoZone.fromApi(Map<String, dynamic> map) {
    final rawPolygon = map['polygon'] as List<dynamic>? ?? const [];
    return GeoZone(
      id: map['id']?.toString() ?? '',
      name: map['name']?.toString() ?? 'Zona',
      code: map['code']?.toString() ?? '',
      polygon: rawPolygon
          .whereType<Map<String, dynamic>>()
          .map(
            (point) => GeoPoint(
              lat: (point['lat'] as num?)?.toDouble() ?? 0,
              lng: (point['lng'] as num?)?.toDouble() ?? 0,
            ),
          )
          .toList(),
    );
  }
}

class GeoPoint {
  const GeoPoint({required this.lat, required this.lng});

  final double lat;
  final double lng;
}

class DropMarker {
  const DropMarker({
    required this.taskId,
    required this.unitBarcode,
    required this.happenedAt,
    required this.point,
  });

  final String taskId;
  final String unitBarcode;
  final DateTime happenedAt;
  final GeoPoint point;
}
