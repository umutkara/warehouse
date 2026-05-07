import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/i18n/app_i18n.dart';
import '../../home/application/courier_app_controller.dart';
import '../../../shared/widgets/barcode_scanner_sheet.dart';
import '../../shared/widgets/status_chip.dart';
import '../domain/courier_task.dart';
import '../domain/pending_assignment.dart';
import 'task_details_page.dart';

class TasksPage extends StatefulWidget {
  const TasksPage({super.key, required this.controller});

  final CourierAppController controller;

  @override
  State<TasksPage> createState() => _TasksPageState();
}

class _TasksPageState extends State<TasksPage> {
  final Set<String> _selectedPendingIds = <String>{};
  final Set<String> _selectedTaskIds = <String>{};

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
    final showFinishBar = _selectedTaskIds.isNotEmpty;
    final tasksEmpty = widget.controller.tasks.isEmpty;
    return Stack(
      children: [
        ListView(
          padding: EdgeInsets.fromLTRB(10, 10, 10, showFinishBar ? 96 : 10),
          children: [
            _PendingAssignmentsSection(
              controller: widget.controller,
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
            SizedBox(height: tasksEmpty ? 20 : 12),
            _PremiumMyTasksSection(
              title: context.t('tasks.my_tasks'),
              taskCount: widget.controller.tasks.length,
              child: tasksEmpty
                  ? const _MyTasksEmptyPlaceholder()
                  : _TasksGroupedByScenario(
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
                                  task.assignedByLogistics &&
                                      !task.pickupConfirmed
                                  ? () => _confirmPickupForTask(context, task)
                                  : null,
                              onRejectPickup:
                                  task.assignedByLogistics &&
                                      !task.pickupConfirmed
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

/// Каркас секции «Мои задачи»: спокойный градиент, чёткая иерархия, бейдж счётчика.
class _PremiumMyTasksSection extends StatelessWidget {
  const _PremiumMyTasksSection({
    required this.title,
    required this.taskCount,
    required this.child,
  });

  final String title;
  final int taskCount;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            cs.surfaceContainerHighest.withValues(alpha: 0.92),
            cs.surface.withValues(alpha: 0.88),
          ],
        ),
        border: Border.all(
          color: cs.outlineVariant.withValues(alpha: 0.55),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.26),
            blurRadius: 28,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    color: cs.primary.withValues(alpha: 0.14),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Icon(
                      Icons.inventory_2_rounded,
                      color: cs.primary,
                      size: 22,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: tt.titleLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                          letterSpacing: -0.3,
                        ),
                      ),
                      Text(
                        context.t('tasks.my_tasks_hint'),
                        style: tt.bodySmall?.copyWith(
                          color: cs.onSurfaceVariant,
                          height: 1.25,
                        ),
                      ),
                    ],
                  ),
                ),
                if (taskCount > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(999),
                      color: cs.primaryContainer.withValues(alpha: 0.55),
                      border: Border.all(
                        color: cs.primary.withValues(alpha: 0.35),
                      ),
                    ),
                    child: Text(
                      '$taskCount',
                      style: tt.labelLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: cs.onPrimaryContainer,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 18),
            child,
          ],
        ),
      ),
    );
  }
}

class _MyTasksEmptyPlaceholder extends StatelessWidget {
  const _MyTasksEmptyPlaceholder();

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Center(
        child: Column(
          children: [
            Icon(
              Icons.task_alt_rounded,
              size: 44,
              color: cs.onSurfaceVariant.withValues(alpha: 0.65),
            ),
            const SizedBox(height: 12),
            Text(
              context.t('tasks.no_active_tasks'),
              textAlign: TextAlign.center,
              style: tt.bodyLarge?.copyWith(
                color: cs.onSurfaceVariant,
                height: 1.35,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PendingAssignmentsSection extends StatelessWidget {
  const _PendingAssignmentsSection({
    required this.controller,
    required this.selectedIds,
    required this.onToggleSelected,
    required this.onConfirmSelected,
    required this.onRejectSelected,
  });

  final CourierAppController controller;
  final Set<String> selectedIds;
  final void Function(String shipmentId, bool selected) onToggleSelected;
  final Future<void> Function() onConfirmSelected;
  final Future<void> Function() onRejectSelected;

  @override
  Widget build(BuildContext context) {
    final assignments = controller.pendingAssignments;
    final formatter = DateFormat('dd.MM HH:mm');
    final count = assignments.length;
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            cs.primary.withValues(alpha: 0.09),
            cs.primaryContainer.withValues(alpha: 0.26),
          ],
        ),
        border: Border.all(
          color: cs.primary.withValues(alpha: 0.22),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.18),
            blurRadius: 24,
            offset: const Offset(0, 11),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: Theme(
          data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
          child: ExpansionTile(
            initiallyExpanded: false,
            maintainState: true,
            tilePadding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
            childrenPadding: EdgeInsets.zero,
            iconColor: cs.primary,
            collapsedIconColor: cs.primary,
            shape: const Border(),
            collapsedShape: const Border(),
            leading: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                color: cs.primary.withValues(alpha: 0.12),
              ),
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Icon(
                  Icons.local_shipping_rounded,
                  color: cs.primary,
                  size: 22,
                ),
              ),
            ),
            title: Text(
              tr(context.t('tasks.pending.title'), {'count': count}),
              style: tt.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
                letterSpacing: -0.25,
              ),
            ),
            subtitle: Padding(
              padding: const EdgeInsets.only(top: 6, right: 4),
              child: Text(
                context.t('tasks.pending.section_hint'),
                style: tt.bodySmall?.copyWith(
                  color: cs.onSurfaceVariant,
                  height: 1.32,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 0, 18, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.t('tasks.pending.body'),
                      style: tt.bodyMedium?.copyWith(
                        color: cs.onSurfaceVariant,
                        height: 1.38,
                      ),
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: () async => _scanConfirm(context),
                        icon: const Icon(Icons.qr_code_scanner_rounded),
                        label: Text(context.t('tasks.pending.scan_confirm')),
                        style: FilledButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    if (assignments.isEmpty)
                      const _PendingLogisticsEmpty()
                    else
                      ...assignments.map(
                        (assignment) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _PendingAssignmentTile(
                            assignment: assignment,
                            selected: selectedIds.contains(assignment.id),
                            formatter: formatter,
                            onToggle: (value) =>
                                onToggleSelected(assignment.id, value),
                          ),
                        ),
                      ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton(
                            onPressed: selectedIds.isEmpty
                                ? null
                                : () async => onConfirmSelected(),
                            style: FilledButton.styleFrom(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            child: Text(
                              tr(context.t('tasks.pending.confirm_bulk'), {
                                'count': selectedIds.length,
                              }),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: OutlinedButton(
                            onPressed: selectedIds.isEmpty
                                ? null
                                : () async => onRejectSelected(),
                            style: OutlinedButton.styleFrom(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            child: Text(
                              tr(context.t('tasks.pending.reject_bulk'), {
                                'count': selectedIds.length,
                              }),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _scanConfirm(BuildContext context) async {
    final scanned = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => BarcodeScannerSheet(
          title: context.t('tasks.pending.scan_confirm_title'),
        ),
      ),
    );
    if (scanned == null || scanned.isEmpty) return;
    await controller.scanConfirmAssignment(scanned);
    if (!context.mounted) return;
    if (controller.error == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            tr(context.t('tasks.pending.scan_confirm_snack'), {
              'barcode': scanned,
            }),
          ),
        ),
      );
    }
  }
}

class _PendingLogisticsEmpty extends StatelessWidget {
  const _PendingLogisticsEmpty();

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: Center(
        child: Column(
          children: [
            Icon(
              Icons.inbox_rounded,
              size: 46,
              color: cs.onSurfaceVariant.withValues(alpha: 0.55),
            ),
            const SizedBox(height: 12),
            Text(
              context.t('tasks.pending.none'),
              textAlign: TextAlign.center,
              style: tt.bodyLarge?.copyWith(
                color: cs.onSurfaceVariant,
                height: 1.35,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Длинный «Сценарий: …» — две строки и кнопка развернуть.
class _ExpandablePendingScenario extends StatefulWidget {
  const _ExpandablePendingScenario({required this.fullText});

  final String fullText;

  @override
  State<_ExpandablePendingScenario> createState() =>
      _ExpandablePendingScenarioState();
}

class _ExpandablePendingScenarioState extends State<_ExpandablePendingScenario> {
  bool expanded = false;

  static const int _shortEnough = 72;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final style = tt.labelSmall?.copyWith(
      height: 1.38,
      fontWeight: FontWeight.w500,
    );
    final decor = BoxDecoration(
      borderRadius: BorderRadius.circular(10),
      color: cs.secondaryContainer.withValues(alpha: 0.45),
      border: Border.all(
        color: cs.outlineVariant.withValues(alpha: 0.35),
      ),
    );

    final needToggle = widget.fullText.length > _shortEnough;

    final inner = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      child: needToggle && !expanded
          ? Text(
              widget.fullText,
              style: style,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            )
          : SelectableText(widget.fullText, style: style),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DecoratedBox(decoration: decor, child: inner),
        if (needToggle)
          TextButton(
            style: TextButton.styleFrom(
              padding: const EdgeInsets.only(top: 2, bottom: 0),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            onPressed: () => setState(() => expanded = !expanded),
            child: Text(
              expanded
                  ? context.t('tasks.pending.scenario_collapse')
                  : context.t('tasks.pending.scenario_expand'),
              style: tt.labelMedium?.copyWith(
                color: cs.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
      ],
    );
  }
}

class _PendingAssignmentTile extends StatelessWidget {
  const _PendingAssignmentTile({
    required this.assignment,
    required this.selected,
    required this.formatter,
    required this.onToggle,
  });

  final PendingAssignment assignment;
  final bool selected;
  final DateFormat formatter;
  final ValueChanged<bool> onToggle;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final small = tt.bodySmall?.copyWith(
      color: cs.onSurfaceVariant,
      height: 1.35,
    );
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: selected
              ? cs.primary.withValues(alpha: 0.58)
              : cs.outlineVariant.withValues(alpha: 0.42),
          width: selected ? 1.5 : 1,
        ),
        color: selected
            ? cs.primary.withValues(alpha: 0.09)
            : cs.surfaceContainerHighest.withValues(alpha: 0.52),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.11),
            blurRadius: 14,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(6, 10, 14, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Checkbox(
                value: selected,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(5),
                ),
                onChanged: (value) => onToggle(value ?? false),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SelectableText(
                    assignment.barcode,
                    style: tt.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.1,
                    ),
                  ),
                  const SizedBox(height: 6),
                  SelectableText(
                    tr(context.t('tasks.pending.out_at'), {
                      'dt': formatter.format(assignment.outAt.toLocal()),
                    }),
                    style: small,
                  ),
                  if (assignment.productName != null) ...[
                    const SizedBox(height: 4),
                    SelectableText(
                      tr(context.t('tasks.pending.product'), {
                        'name': assignment.productName,
                      }),
                      style: small?.copyWith(color: cs.onSurface),
                    ),
                  ],
                  if (assignment.partnerName != null) ...[
                    const SizedBox(height: 2),
                    SelectableText(
                      tr(context.t('tasks.pending.partner'), {
                        'name': assignment.partnerName,
                      }),
                      style: small,
                    ),
                  ],
                  if (assignment.scenario != null &&
                      assignment.scenario!.trim().isNotEmpty) ...[
                    const SizedBox(height: 6),
                    _ExpandablePendingScenario(
                      fullText: tr(context.t('tasks.pending.scenario'), {
                        'scenario': assignment.scenario!.trim(),
                      }),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
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

  static String _scenarioKey(CourierTask t) => (t.scenario ?? '').trim();

  @override
  Widget build(BuildContext context) {
    final groups = <String, List<CourierTask>>{};
    for (final task in tasks) {
      groups.putIfAbsent(_scenarioKey(task), () => []).add(task);
    }
    final sortedKeys = groups.keys.toList()
      ..sort((a, b) {
        if (a.isEmpty) return 1;
        if (b.isEmpty) return -1;
        return a.compareTo(b);
      });

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final scenarioKey in sortedKeys) ...[
          Padding(
            padding: const EdgeInsets.only(bottom: 10, top: 2),
            child: Align(
              alignment: Alignment.centerLeft,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  gradient: LinearGradient(
                    colors: [
                      Theme.of(context).colorScheme.primary.withValues(
                            alpha: 0.22,
                          ),
                      Theme.of(context).colorScheme.secondary.withValues(
                            alpha: 0.12,
                          ),
                    ],
                  ),
                  border: Border.all(
                    color: Theme.of(context).colorScheme.outlineVariant
                        .withValues(alpha: 0.45),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 7,
                  ),
                  child: Text(
                    scenarioKey.isEmpty
                        ? context.t('tasks.no_scenario')
                        : scenarioKey,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.35,
                        ),
                  ),
                ),
              ),
            ),
          ),
          ...groups[scenarioKey]!.map(
            (task) => _TaskCard(
              task: task,
              selected: selectedIds.contains(task.id),
              onToggleSelected: (selected) =>
                  onToggleSelected(task.id, selected),
              onOpen: () => onOpenTask(task),
              dense: true,
            ),
          ),
          if (scenarioKey != sortedKeys.last) const SizedBox(height: 12),
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
    final cs = theme.colorScheme;
    final smallStyle = theme.textTheme.bodySmall?.copyWith(
      fontSize: 12.5,
      height: 1.35,
      color: cs.onSurfaceVariant,
    );
    final showNotPicked = task.assignedByLogistics && !task.pickupConfirmed;

    final cardSurface = selected
        ? cs.primary.withValues(alpha: 0.10)
        : cs.surfaceContainerHighest.withValues(alpha: 0.48);

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Checkbox(
              value: selected,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(5),
              ),
              onChanged: (value) => onToggleSelected(value ?? false),
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOutCubic,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(22),
                border: Border.all(
                  color: selected
                      ? cs.primary.withValues(alpha: 0.62)
                      : cs.outlineVariant.withValues(alpha: 0.40),
                  width: selected ? 1.5 : 1,
                ),
                color: cardSurface,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.16),
                    blurRadius: 18,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Padding(
                padding: EdgeInsets.fromLTRB(14, 12, 14, dense ? 10 : 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: SelectableText(
                            task.barcode,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.15,
                              fontFeatures: const [
                                FontFeature.tabularFigures(),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        StatusChip(
                          status: task.status,
                          opsStatus: task.opsStatus,
                          label: showNotPicked
                              ? context.t('task.not_picked')
                              : null,
                          color: showNotPicked ? Colors.red.shade700 : null,
                        ),
                      ],
                    ),
                    if (task.assignedByLogistics) ...[
                      SizedBox(height: dense ? 8 : 10),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: cs.tertiaryContainer.withValues(alpha: 0.55),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: cs.outlineVariant.withValues(alpha: 0.35),
                          ),
                        ),
                        child: SelectableText(
                          tr(context.t('task.assigned_by_logistics'), {
                            'suffix': task.assignedCourierName != null
                                ? tr(context.t('task.assigned_suffix_name'), {
                                    'name': task.assignedCourierName,
                                  })
                                : '',
                          }),
                          style: smallStyle?.copyWith(
                            color: cs.onTertiaryContainer,
                          ),
                        ),
                      ),
                    ],
                    if (task.productName != null ||
                        task.partnerName != null ||
                        (task.scenario != null &&
                            task.scenario!.isNotEmpty)) ...[
                      SizedBox(height: dense ? 8 : 10),
                      Wrap(
                        spacing: 10,
                        runSpacing: 6,
                        children: [
                          if (task.productName != null)
                            SelectableText(
                              task.productName!,
                              style: smallStyle,
                            ),
                          if (task.partnerName != null)
                            SelectableText(
                              '• ${task.partnerName}',
                              style: smallStyle,
                            ),
                          if (task.scenario != null &&
                              task.scenario!.isNotEmpty)
                            SelectableText(
                              '• ${task.scenario}',
                              style: smallStyle,
                            ),
                        ],
                      ),
                    ],
                    SizedBox(height: dense ? 8 : 10),
                    SelectableText(
                      tr(context.t('task.claimed_short'), {
                        'dt': formatter.format(task.claimedAt.toLocal()),
                      }),
                      style: smallStyle?.copyWith(
                        color: cs.onSurfaceVariant.withValues(alpha: 0.92),
                      ),
                    ),
                    SizedBox(height: dense ? 10 : 12),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton.tonal(
                        onPressed: onOpen,
                        style: FilledButton.styleFrom(
                          padding: EdgeInsets.symmetric(
                            horizontal: dense ? 14 : 18,
                            vertical: dense ? 8 : 12,
                          ),
                          minimumSize: dense ? Size.zero : null,
                          tapTargetSize: dense
                              ? MaterialTapTargetSize.shrinkWrap
                              : null,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: Text(context.t('common.open')),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
