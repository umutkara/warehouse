import 'package:flutter/material.dart';

import '../../../core/i18n/app_i18n.dart';
import '../../home/application/courier_app_controller.dart';
import '../../shared/widgets/section_card.dart';

class WarehouseHandoverPage extends StatefulWidget {
  const WarehouseHandoverPage({super.key, required this.controller});

  final CourierAppController controller;

  @override
  State<WarehouseHandoverPage> createState() => _WarehouseHandoverPageState();
}

class _WarehouseHandoverPageState extends State<WarehouseHandoverPage> {
  final _notesController = TextEditingController();

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final activeTasks = widget.controller.tasks.length;
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        SectionCard(
          title: context.t('warehouse.handover.title'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                tr(context.t('warehouse.handover.courier'), {
                  'name': widget.controller.courierName,
                }),
              ),
              Text(
                tr(context.t('warehouse.handover.active_tasks'), {
                  'count': activeTasks,
                }),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _notesController,
                maxLines: 3,
                decoration: InputDecoration(
                  border: OutlineInputBorder(),
                  hintText: context.t('warehouse.handover.note_hint'),
                ),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: () async {
                  await widget.controller.startHandover(
                    note: _notesController.text.trim(),
                  );
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(context.t('warehouse.handover.started')),
                    ),
                  );
                },
                icon: const Icon(Icons.inventory_2),
                label: Text(context.t('warehouse.handover.start')),
              ),
            ],
          ),
        ),
        SectionCard(
          title: context.t('warehouse.queue.title'),
          child: Text(
            tr(context.t('warehouse.queue.pending_events'), {
              'count': widget.controller.pendingQueueCount,
            }),
          ),
        ),
      ],
    );
  }
}
