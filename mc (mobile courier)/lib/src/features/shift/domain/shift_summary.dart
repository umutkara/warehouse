import '../../tasks/domain/courier_task.dart';

class ShiftSummary {
  const ShiftSummary({
    required this.totalAssigned,
    required this.delivered,
    required this.problematic,
  });

  final int totalAssigned;
  final int delivered;
  final int problematic;

  factory ShiftSummary.fromTasks({
    required List<CourierTask> tasks,
    required int pendingLogisticsAssignments,
    required int problematic,
  }) {
    return ShiftSummary(
      totalAssigned:
          tasks.where((task) => task.assignedByLogistics).length +
          pendingLogisticsAssignments,
      delivered: tasks.where((task) => task.status == 'dropped').length,
      problematic: problematic,
    );
  }
}
