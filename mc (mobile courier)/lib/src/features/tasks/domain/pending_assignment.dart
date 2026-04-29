class PendingAssignment {
  const PendingAssignment({
    required this.id,
    required this.unitId,
    required this.barcode,
    required this.outAt,
    this.courierName,
    this.productName,
    this.partnerName,
    this.scenario,
  });

  final String id;
  final String unitId;
  final String barcode;
  final DateTime outAt;
  final String? courierName;
  final String? productName;
  final String? partnerName;
  final String? scenario;

  factory PendingAssignment.fromApi(Map<String, dynamic> map) {
    final unit = map['unit'] as Map<String, dynamic>?;
    return PendingAssignment(
      id: map['id']?.toString() ?? '',
      unitId: map['unit_id']?.toString() ?? '',
      barcode:
          unit?['barcode']?.toString() ?? map['unit_id']?.toString() ?? 'N/A',
      outAt:
          DateTime.tryParse(map['out_at']?.toString() ?? '') ?? DateTime.now(),
      courierName: map['courier_name']?.toString(),
      productName: unit?['product_name']?.toString(),
      partnerName: unit?['partner_name']?.toString(),
      scenario: map['scenario']?.toString(),
    );
  }
}
