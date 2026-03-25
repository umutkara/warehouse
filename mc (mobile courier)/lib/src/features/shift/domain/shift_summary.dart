class ShiftSummary {
  const ShiftSummary({
    required this.totalAssigned,
    required this.inRoute,
    required this.delivered,
    required this.problematic,
  });

  final int totalAssigned;
  final int inRoute;
  final int delivered;
  final int problematic;

  factory ShiftSummary.fromTaskStatuses(List<String> statuses) {
    final assigned = statuses.length;
    final delivered = statuses.where((s) => s == 'delivered' || s == 'returned').length;
    final inRoute = statuses.where((s) => s == 'in_route' || s == 'arrived' || s == 'dropped').length;
    final problematic = statuses.where((s) => s == 'failed' || s == 'canceled').length;

    return ShiftSummary(
      totalAssigned: assigned,
      inRoute: inRoute,
      delivered: delivered,
      problematic: problematic,
    );
  }
}
