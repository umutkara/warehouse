import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/network/api_client.dart';
import '../../../core/i18n/app_i18n.dart';
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
          title: context.t('shift.current.title'),
          child: controller.currentShift == null
              ? Text(context.t('shift.current.none'))
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tr(context.t('shift.current.id'), {
                        'id': controller.currentShift!.id,
                      }),
                    ),
                    Text(
                      tr(context.t('shift.current.status'), {
                        'status': _shiftStatusLabel(
                          context,
                          controller.currentShift!.status,
                        ),
                      }),
                    ),
                    Text(
                      tr(context.t('shift.current.started'), {
                        'dt': formatter.format(
                          controller.currentShift!.startedAt.toLocal(),
                        ),
                      }),
                    ),
                    Text(
                      tr(context.t('shift.current.active_tasks'), {
                        'count': controller.tasks.length,
                      }),
                    ),
                  ],
                ),
        ),
        SectionCard(
          title: context.t('shift.summary.title'),
          child: Column(
            children: [
              _MetricTile(
                label: context.t('shift.metric.assigned'),
                value: summary.totalAssigned,
              ),
              _MetricTile(
                label: context.t('shift.metric.delivered'),
                value: summary.delivered,
              ),
              _MetricTile(
                label: context.t('shift.metric.problematic'),
                value: summary.problematic,
              ),
            ],
          ),
        ),
        SectionCard(
          title: context.t('shift.close.title'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(context.t('shift.close.body1')),
              const SizedBox(height: 8),
              Text(
                context.t('shift.close.body2'),
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              Builder(
                builder: (context) {
                  final isClosed = controller.currentShift?.status == 'closed';
                  return FilledButton.icon(
                    onPressed: isClosed
                        ? null
                        : () async {
                            final confirm = await showDialog<bool>(
                              context: context,
                              builder: (ctx) => AlertDialog(
                                title: Text(
                                  context.t('shift.close.confirm_title'),
                                ),
                                content: Text(
                                  context.t('shift.close.confirm_body'),
                                ),
                                actions: [
                                  TextButton(
                                    onPressed: () =>
                                        Navigator.of(ctx).pop(false),
                                    child: Text(context.t('common.cancel')),
                                  ),
                                  FilledButton(
                                    onPressed: () =>
                                        Navigator.of(ctx).pop(true),
                                    child: Text(
                                      context.t('shift.close.confirm_yes'),
                                    ),
                                  ),
                                ],
                              ),
                            );
                            if (confirm != true || !context.mounted) return;
                            debugPrint(
                              '[ShiftPage] closeShift: sending request',
                            );
                            try {
                              await controller.closeShift(
                                force: false,
                                note: 'Обычное закрытие из мобильного',
                              );
                              debugPrint('[ShiftPage] closeShift: success');
                              if (!context.mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    context.t('shift.closed_snack'),
                                  ),
                                ),
                              );
                            } on ApiException catch (e) {
                              debugPrint(
                                '[ShiftPage] closeShift error: ${e.statusCode} ${e.message}',
                              );
                              if (!context.mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(e.message),
                                  backgroundColor: Theme.of(
                                    context,
                                  ).colorScheme.error,
                                ),
                              );
                            } catch (e, st) {
                              debugPrint(
                                '[ShiftPage] closeShift unexpected error: $e',
                              );
                              debugPrint(st.toString());
                              if (!context.mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text('Ошибка: ${e.toString()}'),
                                  backgroundColor: Theme.of(
                                    context,
                                  ).colorScheme.error,
                                ),
                              );
                            }
                          },
                    icon: Icon(
                      isClosed ? Icons.check_circle : Icons.lock_clock,
                    ),
                    label: Text(
                      isClosed
                          ? context.t('shift.already_closed')
                          : context.t('shift.close.action'),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _shiftStatusLabel(BuildContext context, String status) {
    switch (status) {
      case 'open':
        return context.t('shift.status.open');
      case 'closing':
        return context.t('shift.status.closing');
      case 'closed':
        return context.t('shift.status.closed');
      case 'canceled':
        return context.t('shift.status.canceled');
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
