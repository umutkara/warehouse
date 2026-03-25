class CourierTask {
  const CourierTask({
    required this.id,
    required this.unitId,
    required this.barcode,
    required this.status,
    required this.claimedAt,
    this.shipmentId,
    this.zoneId,
    this.partnerName,
    this.productName,
    this.scenario,
    this.assignedByLogistics = false,
    this.assignedCourierName,
    this.pickupConfirmed = false,
    this.pickupStatus,
    this.selfPickup = false,
    this.lastEventAt,
  });

  final String id;
  final String unitId;
  final String barcode;
  final String status;
  final DateTime claimedAt;
  final String? shipmentId;
  final String? zoneId;
  final String? partnerName;
  final String? productName;
  final String? scenario;
  final bool assignedByLogistics;
  final String? assignedCourierName;
  final bool pickupConfirmed;
  final String? pickupStatus;
  final bool selfPickup;
  final DateTime? lastEventAt;

  factory CourierTask.fromApi(Map<String, dynamic> map) {
    final unit = map['unit'] as Map<String, dynamic>?;
    final meta = map['meta'] as Map<String, dynamic>?;
    final assignedVia = meta?['assigned_via']?.toString();
    final assignedCourierName = meta?['assigned_courier_name']?.toString();
    final selfPickup = map['self_pickup'] == true;
    final lastEventAt = map['last_event_at'] != null
        ? DateTime.tryParse(map['last_event_at'].toString())
        : null;
    return CourierTask(
      id: map['id']?.toString() ?? '',
      unitId: map['unit_id']?.toString() ?? '',
      barcode: unit?['barcode']?.toString() ?? map['unit_id']?.toString() ?? 'Н/Д',
      status: map['status']?.toString() ?? 'claimed',
      claimedAt: DateTime.tryParse(
            map['claimed_at']?.toString() ?? map['out_at']?.toString() ?? '',
          ) ??
          DateTime.now(),
      shipmentId: map['shipment_id']?.toString(),
      zoneId: map['zone_id']?.toString(),
      partnerName: unit?['partner_name']?.toString(),
      productName: unit?['product_name']?.toString(),
      scenario: map['scenario']?.toString(),
      assignedByLogistics: assignedVia == 'logistics',
      assignedCourierName: assignedCourierName,
      pickupConfirmed: map['pickup_confirmed'] == true,
      pickupStatus: map['pickup_status']?.toString(),
      selfPickup: selfPickup,
      lastEventAt: lastEventAt,
    );
  }
}
