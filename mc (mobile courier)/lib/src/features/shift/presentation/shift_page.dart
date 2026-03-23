import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/network/api_client.dart';
import '../../home/application/courier_app_controller.dart';
import '../../shared/widgets/section_card.dart';

class ShiftPage extends StatelessWidget {
  const ShiftPage({super.key, required this.controller});

  final CourierAppController controller;

  @override
  Widget build(BuildContext context) {
    final summary = controller.summary;
    final formatter = DateFormat('dd.MM.yyyy HH:mm');
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        SectionCard(
          title: 'Текущая смена',
          child: controller.currentShift == null
              ? const Text('Открытая смена не найдена')
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('ID смены: ${controller.currentShift!.id}'),
                    Text('Статус: ${_shiftStatusLabel(controller.currentShift!.status)}'),
                    Text('Начата: ${formatter.format(controller.currentShift!.startedAt.toLocal())}'),
                    Text('Активных задач: ${controller.currentShift!.activeTasks}'),
                  ],
                ),
        ),
        SectionCard(
          title: 'Сводка смены',
          child: Column(
            children: [
              _MetricTile(label: 'Назначено', value: summary.totalAssigned),
              _MetricTile(label: 'В маршруте', value: summary.inRoute),
              _MetricTile(label: 'Доставлено/возврат', value: summary.delivered),
              _MetricTile(label: 'Проблемные', value: summary.problematic),
            ],
          ),
        ),
        SectionCard(
          title: 'Закрытие смены',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Передайте на склад оставшиеся заказы до конца смены.',
              ),
              const SizedBox(height: 8),
              Text(
                'Перед закрытием смены все недоставленные заказы будут переданы на склад для приёмки.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              Builder(
                builder: (context) {
                  final isClosed = controller.currentShift?.status == 'closed';
                  return FilledButton.icon(
                    onPressed: isClosed ? null : () async {
                      final confirm = await showDialog<bool>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          title: const Text('Закрыть смену?'),
                          content: const Text(
                            'А точно ли хотите закрыть смену? '
                            'Оставшиеся заказы будут переданы на склад.',
                          ),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.of(ctx).pop(false),
                              child: const Text('Отмена'),
                            ),
                            FilledButton(
                              onPressed: () => Navigator.of(ctx).pop(true),
                              child: const Text('Да, закрыть'),
                            ),
                          ],
                        ),
                      );
                      if (confirm != true || !context.mounted) return;
                      debugPrint('[ShiftPage] closeShift: sending request');
                      try {
                        await controller.closeShift(force: false, note: 'Обычное закрытие из мобильного');
                        debugPrint('[ShiftPage] closeShift: success');
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Смена закрыта')),
                        );
                      } on ApiException catch (e) {
                        debugPrint('[ShiftPage] closeShift error: ${e.statusCode} ${e.message}');
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(e.message),
                            backgroundColor: Theme.of(context).colorScheme.error,
                          ),
                        );
                      } catch (e, st) {
                        debugPrint('[ShiftPage] closeShift unexpected error: $e');
                        debugPrint(st.toString());
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('Ошибка: ${e.toString()}'),
                            backgroundColor: Theme.of(context).colorScheme.error,
                          ),
                        );
                      }
                    },
                    icon: Icon(isClosed ? Icons.check_circle : Icons.lock_clock),
                    label: Text(isClosed ? 'Смена уже закрыта' : 'Закрыть смену'),
                  );
                },
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _shiftStatusLabel(String status) {
    switch (status) {
      case 'open':
        return 'Открыта';
      case 'closing':
        return 'Закрывается';
      case 'closed':
        return 'Закрыта';
      case 'canceled':
        return 'Отменена';
      default:
        return status;
    }
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(child: Text(label)),
          Text(
            value.toString(),
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ],
      ),
    );
  }
}
