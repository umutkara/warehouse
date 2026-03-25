import 'package:flutter/material.dart';

class StatusChip extends StatelessWidget {
  const StatusChip({
    super.key,
    required this.status,
    this.label,
    this.color,
  });

  final String status;
  final String? label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final bg = color ?? _resolveColor(status);
    return Chip(
      label: Text(label ?? _label(status), style: const TextStyle(fontSize: 11)),
      backgroundColor: bg.withValues(alpha: 0.25),
      side: BorderSide(color: bg),
      visualDensity: VisualDensity.compact,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
    );
  }

  Color _resolveColor(String value) {
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

  String _label(String value) {
    switch (value) {
      case 'claimed':
        return 'Взята';
      case 'in_route':
        return 'В маршруте';
      case 'arrived':
        return 'Прибыл';
      case 'dropped':
        return 'Дроп';
      case 'delivered':
        return 'Доставлено';
      case 'returned':
        return 'Возврат';
      case 'failed':
        return 'Проблема';
      case 'canceled':
        return 'Отменена';
      default:
        return value;
    }
  }
}
