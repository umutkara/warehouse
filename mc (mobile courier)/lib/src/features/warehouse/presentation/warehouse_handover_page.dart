import 'package:flutter/material.dart';

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
          title: 'Сдача курьера на склад',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Курьер: ${widget.controller.courierName}'),
              Text('Заказов у курьера на руках: $activeTasks'),
              const SizedBox(height: 12),
              TextField(
                controller: _notesController,
                maxLines: 3,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  hintText: 'Комментарий для приемщика склада',
                ),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: () async {
                  await widget.controller.startHandover(note: _notesController.text.trim());
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Сессия сдачи начата'),
                    ),
                  );
                },
                icon: const Icon(Icons.inventory_2),
                label: const Text('Начать сдачу'),
              ),
            ],
          ),
        ),
        SectionCard(
          title: 'Статус очереди',
          child: Text('Событий в офлайн-очереди: ${widget.controller.pendingQueueCount}'),
        ),
      ],
    );
  }
}
