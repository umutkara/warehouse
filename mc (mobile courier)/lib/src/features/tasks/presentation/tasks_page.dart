import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/i18n/app_i18n.dart';
import '../../home/application/courier_app_controller.dart';
import '../../../shared/widgets/barcode_scanner_sheet.dart';
import '../../shared/widgets/giver_signature_dialog.dart';
import '../../shared/widgets/section_card.dart';
import '../../shared/widgets/status_chip.dart';
import '../domain/courier_task.dart';
import 'task_details_page.dart';

class TasksPage extends StatefulWidget {
  const TasksPage({super.key, required this.controller});

  final CourierAppController controller;

  @override
  State<TasksPage> createState() => _TasksPageState();
}

class _TasksPageState extends State<TasksPage> {
  final _confirmScanController = TextEditingController();
  final Set<String> _selectedPendingIds = <String>{};
  final Set<String> _selectedTaskIds = <String>{};

  @override
  void dispose() {
    _confirmScanController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.controller.loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (widget.controller.error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            tr(context.t('tasks.load_error'), {
              'error': widget.controller.error,
            }),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    if (widget.controller.tasks.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(10),
        children: [
          _PendingAssignmentsSection(
            controller: widget.controller,
            scanController: _confirmScanController,
            selectedIds: _selectedPendingIds,
            onToggleSelected: (shipmentId, selected) {
              setState(() {
                if (selected) {
                  _selectedPendingIds.add(shipmentId);
                } else {
                  _selectedPendingIds.remove(shipmentId);
                }
              });
            },
            onConfirmSelected: () async => _confirmSelected(context),
            onRejectSelected: () async => _rejectSelected(context),
          ),
          const SizedBox(height: 20),
          SectionCard(
            title: context.t('tasks.my_tasks'),
            child: Text(context.t('tasks.no_active_tasks')),
          ),
        ],
      );
    }
    final showFinishBar = _selectedTaskIds.isNotEmpty;
    return Stack(
      children: [
        ListView(
          padding: EdgeInsets.fromLTRB(10, 10, 10, showFinishBar ? 96 : 10),
          children: [
            _PendingAssignmentsSection(
              controller: widget.controller,
              scanController: _confirmScanController,
              selectedIds: _selectedPendingIds,
              onToggleSelected: (shipmentId, selected) {
                setState(() {
                  if (selected) {
                    _selectedPendingIds.add(shipmentId);
                  } else {
                    _selectedPendingIds.remove(shipmentId);
                  }
                });
              },
              onConfirmSelected: () async => _confirmSelected(context),
              onRejectSelected: () async => _rejectSelected(context),
            ),
            const SizedBox(height: 12),
            SectionCard(
              title: context.t('tasks.my_tasks'),
              dense: true,
              child: _TasksGroupedByScenario(
                tasks: widget.controller.tasks,
                selectedIds: _selectedTaskIds,
                onToggleSelected: (taskId, selected) {
                  setState(() {
                    if (selected) {
                      _selectedTaskIds.add(taskId);
                    } else {
                      _selectedTaskIds.remove(taskId);
                    }
                  });
                },
                onOpenTask: (task) {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => TaskDetailsPage(
                        task: task,
                        onMarkDropped: (data) =>
                            widget.controller.markTaskDropped(
                              task,
                              opsStatus: data.status,
                              note: data.note,
                              signaturePngBase64: data.signaturePngBase64,
                              photoBytes: data.photoBytes,
                              photoFileName: data.photoFileName,
                            ),
                        onUndoDrop: task.status == 'dropped'
                            ? () => widget.controller.undoTaskDrop(task)
                            : null,
                        onConfirmPickup:
                            task.assignedByLogistics && !task.pickupConfirmed
                            ? () => _confirmPickupForTask(context, task)
                            : null,
                        onRejectPickup:
                            task.assignedByLogistics && !task.pickupConfirmed
                            ? () => _rejectPickupForTask(context, task)
                            : null,
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
        if (showFinishBar)
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: SafeArea(
              top: false,
              child: Container(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
                decoration: BoxDecoration(
                  color: Theme.of(context).scaffoldBackgroundColor,
                  boxShadow: const [
                    BoxShadow(
                      blurRadius: 12,
                      offset: Offset(0, -2),
                      color: Color(0x22000000),
                    ),
                  ],
                ),
                child: FilledButton.icon(
                  onPressed: () => _finishSelectedRoutes(context),
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.green.shade700,
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(48),
                  ),
                  icon: const Icon(Icons.playlist_add_check_circle_outlined),
                  label: Text(context.t('task.finish_route')),
                ),
              ),
            ),
          ),
      ],
    );
  }

  Future<void> _confirmSelected(BuildContext context) async {
    if (_selectedPendingIds.isEmpty) return;
    final confirmed = await _showPickupConfirmDialog(context);
    if (!mounted || confirmed != true) return;
    await widget.controller.confirmPendingAssignments(
      shipmentIds: _selectedPendingIds.toList(),
    );
    if (!mounted) return;
    if (widget.controller.error == null) {
      setState(() => _selectedPendingIds.clear());
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.t('tasks.pickup_confirmed'))),
      );
    }
  }

  bool _canFinishRoute(CourierTask task) {
    return canShowFinishRouteAction(task);
  }

  Future<void> _finishSelectedRoutes(BuildContext context) async {
    if (_selectedTaskIds.isEmpty) return;
    final selectedTasks = widget.controller.tasks
        .where((task) => _selectedTaskIds.contains(task.id))
        .toList();
    final tasksToFinish = selectedTasks.where(_canFinishRoute).toList();
    if (tasksToFinish.isEmpty) {
      final messageKey = selectedTasks.any((task) => task.selfPickup)
          ? 'tasks.finish_route_self_pickup_only'
          : 'tasks.finish_route_none';
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(context.t(messageKey))));
      return;
    }

    final selected = await showDropOpsStatusDialog(context);
    if (!mounted || selected == null) return;

    var completed = 0;
    for (final task in tasksToFinish) {
      await widget.controller.markTaskDropped(
        task,
        opsStatus: selected.status,
        note: selected.note,
        signaturePngBase64: selected.signaturePngBase64,
        photoBytes: selected.photoBytes,
        photoFileName: selected.photoFileName,
      );
      if (!mounted) return;
      if (widget.controller.error != null) break;
      completed += 1;
    }

    if (widget.controller.error == null) {
      setState(() => _selectedTaskIds.clear());
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            tr(context.t('tasks.finish_route_bulk_snack'), {
              'count': completed,
            }),
          ),
        ),
      );
    }
  }

  Future<void> _confirmPickupForTask(
    BuildContext context,
    CourierTask task,
  ) async {
    final shipmentId = task.shipmentId;
    if (shipmentId == null || shipmentId.isEmpty) return;
    final confirmed = await _showPickupConfirmDialog(context);
    if (!mounted || confirmed != true) return;

    await widget.controller.confirmPendingAssignments(
      shipmentIds: [shipmentId],
    );
    if (!mounted) return;
    if (widget.controller.error == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            tr(context.t('tasks.pickup_confirmed_for'), {
              'barcode': task.barcode,
            }),
          ),
        ),
      );
    }
  }

  Future<bool?> _showPickupConfirmDialog(BuildContext context) {
    return showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text(context.t('tasks.pickup_confirm_dialog.title')),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: Text(context.t('common.no')),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: Text(context.t('common.yes')),
            ),
          ],
        );
      },
    );
  }

  Future<void> _rejectPickupForTask(
    BuildContext context,
    CourierTask task,
  ) async {
    final shipmentId = task.shipmentId;
    if (shipmentId == null || shipmentId.isEmpty) return;
    var noteText = '';
    final note = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text(context.t('tasks.pickup_reject.title')),
          content: TextField(
            maxLines: 3,
            onChanged: (value) => noteText = value,
            decoration: InputDecoration(
              hintText: context.t('tasks.pickup_reject.reason_hint'),
              border: const OutlineInputBorder(),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: Text(context.t('common.cancel')),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(noteText.trim()),
              child: Text(context.t('common.save')),
            ),
          ],
        );
      },
    );
    if (!mounted || note == null || note.isEmpty) return;

    await widget.controller.rejectPendingAssignments(
      shipmentIds: [shipmentId],
      note: note,
    );
    if (!mounted) return;
    if (widget.controller.error == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            tr(context.t('tasks.pickup_reject_saved_for'), {
              'barcode': task.barcode,
            }),
          ),
        ),
      );
    }
  }

  Future<void> _rejectSelected(BuildContext context) async {
    if (_selectedPendingIds.isEmpty) return;
    var noteText = '';
    final note = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text(context.t('tasks.pickup_reject.title')),
          content: TextField(
            maxLines: 3,
            onChanged: (value) => noteText = value,
            decoration: InputDecoration(
              hintText: context.t('tasks.pickup_reject.reason_hint'),
              border: const OutlineInputBorder(),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: Text(context.t('common.cancel')),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(noteText.trim()),
              child: Text(context.t('common.save')),
            ),
          ],
        );
      },
    );
    if (!mounted || note == null || note.isEmpty) return;

    await widget.controller.rejectPendingAssignments(
      shipmentIds: _selectedPendingIds.toList(),
      note: note,
    );
    if (!mounted) return;
    if (widget.controller.error == null) {
      setState(() => _selectedPendingIds.clear());
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.t('tasks.pickup_reject_saved'))),
      );
    }
  }
}

class _PendingAssignmentsSection extends StatelessWidget {
  const _PendingAssignmentsSection({
    required this.controller,
    required this.scanController,
    required this.selectedIds,
    required this.onToggleSelected,
    required this.onConfirmSelected,
    required this.onRejectSelected,
  });

  final CourierAppController controller;
  final TextEditingController scanController;
  final Set<String> selectedIds;
  final void Function(String shipmentId, bool selected) onToggleSelected;
  final Future<void> Function() onConfirmSelected;
  final Future<void> Function() onRejectSelected;

  String _normalizedBarcode(String value) => value.trim().toLowerCase();

  @override
  Widget build(BuildContext context) {
    final assignments = controller.pendingAssignments;
    final formatter = DateFormat('dd.MM HH:mm');
    final count = assignments.length;
    final colorScheme = Theme.of(context).colorScheme;
    final highlighted = count > 0;
    return Card(
      color: highlighted
          ? colorScheme.primaryContainer.withValues(alpha: 0.3)
          : null,
      elevation: highlighted ? 2 : 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: highlighted
            ? BorderSide(
                color: colorScheme.primary.withValues(alpha: 0.6),
                width: 2,
              )
            : BorderSide.none,
      ),
      child: ExpansionTile(
        initiallyExpanded: false,
        tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        title: Text(
          'Задания от логистов — неподтвержденные ($count)',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: highlighted ? FontWeight.bold : null,
          ),
        ),
        subtitle: const Text(
          'Подтвердите забор или укажите незабор с причиной',
        ),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Подтвердите забор сканом или выберите заказы и подтвердите массово.',
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: scanController,
                  decoration: const InputDecoration(
                    labelText: 'Скан штрихкода для авто-подтверждения',
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) async => _scanConfirm(context),
                ),
                const SizedBox(height: 10),
                FilledButton.icon(
                  onPressed: () async => _scanConfirm(context),
                  icon: const Icon(Icons.qr_code_scanner),
                  label: const Text('Сканировать и подтвердить'),
                ),
                const SizedBox(height: 12),
                if (assignments.isEmpty)
                  const Text('Нет неподтвержденных заказов')
                else
                  ...assignments.map((assignment) {
                    final selected = selectedIds.contains(assignment.id);
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Checkbox(
                            value: selected,
                            onChanged: (value) =>
                                onToggleSelected(assignment.id, value ?? false),
                          ),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  assignment.barcode,
                                  style: Theme.of(context).textTheme.titleSmall,
                                ),
                                Text(
                                  'Отгружен: ${formatter.format(assignment.outAt.toLocal())}',
                                ),
                                if (assignment.productName != null)
                                  Text('Товар: ${assignment.productName}'),
                                if (assignment.partnerName != null)
                                  Text('Партнер: ${assignment.partnerName}'),
                                if (assignment.scenario != null &&
                                    assignment.scenario!.isNotEmpty)
                                  Text('Сценарий: ${assignment.scenario}'),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  }),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton(
                        onPressed: selectedIds.isEmpty
                            ? null
                            : () async => onConfirmSelected(),
                        child: Text(
                          'Подтвердить забор (${selectedIds.length})',
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: selectedIds.isEmpty
                            ? null
                            : () async => onRejectSelected(),
                        child: Text('Незабор (${selectedIds.length})'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _scanConfirm(BuildContext context) async {
    final scanned = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => BarcodeScannerSheet(title: 'Сканировать и подтвердить'),
      ),
    );
    final normalizedScanned = scanned == null
        ? ''
        : _normalizedBarcode(scanned);
    final matchingPending = controller.pendingAssignments
        .where(
          (assignment) =>
              _normalizedBarcode(assignment.barcode) == normalizedScanned,
        )
        .length;
    final matchingMyTasks = controller.tasks
        .where((task) => _normalizedBarcode(task.barcode) == normalizedScanned)
        .toList();
    if (scanned == null || scanned.isEmpty) return;
    scanController.text = scanned;
    if (matchingPending > 0 || matchingMyTasks.isNotEmpty) {
      await controller.scanConfirmAssignment(scanned);
      if (!context.mounted) return;
      if (controller.error == null) {
        scanController.clear();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Забор подтвержден сканом: $scanned')),
        );
      }
      return;
    }
    final signature = await showGiverSignatureDialog(context);
    if (!context.mounted || signature == null || signature.isEmpty) return;
    await controller.scanConfirmAssignment(scanned, giverSignature: signature);
    if (!context.mounted) return;
    if (controller.error == null) {
      scanController.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Забор подтвержден сканом: $scanned')),
      );
    }
  }
}

class _TasksGroupedByScenario extends StatelessWidget {
  const _TasksGroupedByScenario({
    required this.tasks,
    required this.selectedIds,
    required this.onToggleSelected,
    required this.onOpenTask,
  });

  final List<CourierTask> tasks;
  final Set<String> selectedIds;
  final void Function(String taskId, bool selected) onToggleSelected;
  final void Function(CourierTask task) onOpenTask;

  static String _scenarioKey(CourierTask t) => (t.scenario ?? '').trim().isEmpty
      ? 'Без сценария'
      : (t.scenario ?? '').trim();

  @override
  Widget build(BuildContext context) {
    final groups = <String, List<CourierTask>>{};
    for (final task in tasks) {
      groups.putIfAbsent(_scenarioKey(task), () => []).add(task);
    }
    final sortedKeys = groups.keys.toList()
      ..sort((a, b) {
        if (a == 'Без сценария') return 1;
        if (b == 'Без сценария') return -1;
        return a.compareTo(b);
      });

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final scenarioKey in sortedKeys) ...[
          Padding(
            padding: const EdgeInsets.only(bottom: 2),
            child: Text(
              scenarioKey,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                color: Theme.of(context).colorScheme.primary,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
          ),
          ...groups[scenarioKey]!.map(
            (task) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: _TaskCard(
                task: task,
                selected: selectedIds.contains(task.id),
                onToggleSelected: (selected) =>
                    onToggleSelected(task.id, selected),
                onOpen: () => onOpenTask(task),
                dense: true,
              ),
            ),
          ),
          if (scenarioKey != sortedKeys.last) const SizedBox(height: 6),
        ],
      ],
    );
  }
}

class _TaskCard extends StatelessWidget {
  const _TaskCard({
    required this.task,
    required this.selected,
    required this.onToggleSelected,
    required this.onOpen,
    this.dense = false,
  });

  final CourierTask task;
  final bool selected;
  final void Function(bool) onToggleSelected;
  final VoidCallback onOpen;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final formatter = DateFormat('dd.MM HH:mm');
    final theme = Theme.of(context);
    final smallStyle = theme.textTheme.bodySmall?.copyWith(fontSize: 12);
    final showNotPicked = task.assignedByLogistics && !task.pickupConfirmed;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Checkbox(
            value: selected,
            onChanged: (value) => onToggleSelected(value ?? false),
          ),
        ),
        Expanded(
          child: SectionCard(
            title: task.barcode,
            action: StatusChip(
              status: task.status,
              opsStatus: task.opsStatus,
              label: showNotPicked ? 'НЕ ЗАБРАН' : null,
              color: showNotPicked ? Colors.red.shade700 : null,
            ),
            dense: dense,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (task.assignedByLogistics)
                  Padding(
                    padding: EdgeInsets.only(bottom: dense ? 2 : 4),
                    child: Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: dense ? 6 : 8,
                        vertical: dense ? 2 : 3,
                      ),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.tertiaryContainer,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'Назначено логистом${task.assignedCourierName != null ? ': ${task.assignedCourierName}' : ''}',
                        style: smallStyle,
                      ),
                    ),
                  ),
                Wrap(
                  spacing: 8,
                  runSpacing: 0,
                  children: [
                    if (task.productName != null)
                      Text('${task.productName}', style: smallStyle),
                    if (task.partnerName != null)
                      Text('• ${task.partnerName}', style: smallStyle),
                    if (task.scenario != null && task.scenario!.isNotEmpty)
                      Text('• ${task.scenario}', style: smallStyle),
                  ],
                ),
                if ((task.productName != null ||
                    task.partnerName != null ||
                    (task.scenario != null && task.scenario!.isNotEmpty)))
                  const SizedBox(height: 2),
                Text(
                  'Взято: ${formatter.format(task.claimedAt.toLocal())}',
                  style: smallStyle,
                ),
                SizedBox(height: dense ? 4 : 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: FilledButton.tonal(
                    onPressed: onOpen,
                    style: dense
                        ? FilledButton.styleFrom(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 4,
                            ),
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          )
                        : null,
                    child: const Text('Открыть'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
