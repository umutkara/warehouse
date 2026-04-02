import 'package:flutter/material.dart';

import '../../../core/i18n/app_i18n.dart';

class StatusChip extends StatelessWidget {
  const StatusChip({
    super.key,
    required this.status,
    this.opsStatus,
    this.label,
    this.color,
  });

  final String status;
  final String? opsStatus;
  final String? label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final bg = color ?? _resolveColor(status, opsStatus: opsStatus);
    return Chip(
      label: Text(
        label ?? _label(context, status, opsStatus: opsStatus),
        style: const TextStyle(fontSize: 11),
      ),
      backgroundColor: bg.withValues(alpha: 0.25),
      side: BorderSide(color: bg),
      visualDensity: VisualDensity.compact,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
    );
  }

  bool _isReturnToWarehouse(String value, {String? opsStatus}) {
    return (opsStatus == 'partner_rejected_return' || opsStatus == 'client_rejected') &&
        (value == 'claimed' || value == 'in_route' || value == 'arrived');
  }

  Color _resolveColor(String value, {String? opsStatus}) {
    if (_isReturnToWarehouse(value, opsStatus: opsStatus)) {
      return Colors.orange.shade700;
    }
    switch (value) {
      case 'claimed':
      case 'in_route':
      case 'arrived':
        return Colors.blue.shade700;
      case 'dropped':
      case 'delivered':
      case 'returned':
        return Colors.green.shade700;
      case 'failed':
      case 'canceled':
        return Colors.red.shade700;
      default:
        return Colors.orange.shade700;
    }
  }

  String _label(BuildContext context, String value, {String? opsStatus}) {
    if (_isReturnToWarehouse(value, opsStatus: opsStatus)) {
      return context.t('status.return_to_warehouse');
    }
    switch (value) {
      case 'claimed':
        return context.t('status.claimed');
      case 'in_route':
        return context.t('status.in_route');
      case 'arrived':
        return context.t('status.arrived');
      case 'dropped':
        return context.t('status.dropped');
      case 'delivered':
        return context.t('status.delivered');
      case 'returned':
        return context.t('status.returned');
      case 'failed':
        return context.t('status.failed');
      case 'canceled':
        return context.t('status.canceled');
      default:
        return value;
    }
  }
}
