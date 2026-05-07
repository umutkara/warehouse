import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/network/api_client.dart';
import '../../../core/i18n/app_i18n.dart';
import '../../home/application/courier_app_controller.dart';
import '../domain/shift_summary.dart';

class ShiftPage extends StatelessWidget {
  const ShiftPage({super.key, required this.controller});

  final CourierAppController controller;

  @override
  Widget build(BuildContext context) {
    final summary = controller.summary;
    final formatter = DateFormat('dd.MM.yyyy HH:mm');
    final cs = Theme.of(context).colorScheme;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
      children: [
        Text(
          context.t('shift.page.screen_title'),
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
                letterSpacing: -0.5,
              ),
        ),
        const SizedBox(height: 6),
        Text(
          context.t('shift.page.screen_subtitle'),
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: cs.onSurfaceVariant,
                height: 1.35,
              ),
        ),
        const SizedBox(height: 20),
        _ShiftHeroCard(
          controller: controller,
          formatter: formatter,
        ),
        const SizedBox(height: 18),
        _ShiftMetricsPanel(summary: summary),
        const SizedBox(height: 18),
        _ShiftClosePanel(controller: controller),
      ],
    );
  }
}

class _ShiftHeroCard extends StatelessWidget {
  const _ShiftHeroCard({
    required this.controller,
    required this.formatter,
  });

  final CourierAppController controller;
  final DateFormat formatter;

  Color _statusAccent(BuildContext context, String status) {
    final s = status.toLowerCase();
    switch (s) {
      case 'open':
        return const Color(0xFF34C759);
      case 'closing':
        return const Color(0xFFFF9F0A);
      case 'closed':
      case 'canceled':
        return Theme.of(context).colorScheme.outline;
      default:
        return Theme.of(context).colorScheme.primary;
    }
  }

  IconData _statusIcon(String status) {
    switch (status.toLowerCase()) {
      case 'open':
        return Icons.schedule_rounded;
      case 'closing':
        return Icons.hourglass_top_rounded;
      case 'closed':
        return Icons.lock_clock_rounded;
      case 'canceled':
        return Icons.cancel_outlined;
      default:
        return Icons.work_history_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final shift = controller.currentShift;

    if (shift == null) {
      return DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(28),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              cs.surfaceContainerHighest.withValues(alpha: 0.95),
              cs.surface.withValues(alpha: 0.88),
            ],
          ),
          border: Border.all(color: cs.outlineVariant.withValues(alpha: 0.5)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.2),
              blurRadius: 24,
              offset: const Offset(0, 12),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(22),
          child: Column(
            children: [
              Icon(
                Icons.event_busy_rounded,
                size: 52,
                color: cs.onSurfaceVariant.withValues(alpha: 0.65),
              ),
              const SizedBox(height: 14),
              Text(
                context.t('shift.current.none'),
                textAlign: TextAlign.center,
                style: tt.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  height: 1.3,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                context.t('shift.hero.empty_hint'),
                textAlign: TextAlign.center,
                style: tt.bodySmall?.copyWith(
                  color: cs.onSurfaceVariant,
                  height: 1.35,
                ),
              ),
            ],
          ),
        ),
      );
    }

    final accent = _statusAccent(context, shift.status);
    final statusLabel = _shiftStatusLabel(context, shift.status);

    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            accent.withValues(alpha: 0.14),
            cs.surfaceContainerHighest.withValues(alpha: 0.92),
          ],
        ),
        border: Border.all(
          color: accent.withValues(alpha: 0.45),
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: accent.withValues(alpha: 0.12),
            blurRadius: 28,
            offset: const Offset(0, 14),
          ),
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.18),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    color: accent.withValues(alpha: 0.22),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Icon(
                      _statusIcon(shift.status),
                      color: accent,
                      size: 28,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        context.t('shift.current.title'),
                        style: tt.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          letterSpacing: -0.2,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(999),
                          color: accent.withValues(alpha: 0.2),
                          border: Border.all(
                            color: accent.withValues(alpha: 0.45),
                          ),
                        ),
                        child: Text(
                          statusLabel,
                          style: tt.labelLarge?.copyWith(
                            color: accent,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            _heroRow(
              context,
              icon: Icons.tag_rounded,
              label: context.t('shift.hero.id_label'),
              valueWidget: SelectableText(
                shift.id,
                style: tt.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.2,
                ),
              ),
            ),
            const SizedBox(height: 12),
            _heroRow(
              context,
              icon: Icons.play_circle_outline_rounded,
              label: context.t('shift.hero.started_label'),
              valueWidget: SelectableText(
                formatter.format(shift.startedAt.toLocal()),
                style: tt.bodyMedium?.copyWith(fontWeight: FontWeight.w500),
              ),
            ),
            const SizedBox(height: 12),
            _heroRow(
              context,
              icon: Icons.checklist_rounded,
              label: context.t('shift.hero.tasks_label'),
              valueWidget: Text(
                '${controller.tasks.length}',
                style: tt.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: cs.primary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _heroRow(
    BuildContext context, {
    required IconData icon,
    required String label,
    required Widget valueWidget,
  }) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: cs.surface.withValues(alpha: 0.55),
        border: Border.all(
          color: cs.outlineVariant.withValues(alpha: 0.4),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 22, color: cs.primary.withValues(alpha: 0.85)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: tt.labelMedium?.copyWith(
                    color: cs.onSurfaceVariant,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 4),
                DefaultTextStyle.merge(
                  style: tt.bodyMedium,
                  child: valueWidget,
                ),
              ],
            ),
          ),
        ],
      ),
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

class _ShiftMetricsPanel extends StatelessWidget {
  const _ShiftMetricsPanel({required this.summary});

  final ShiftSummary summary;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    Widget metric({
      required IconData icon,
      required Color iconColor,
      required String label,
      required int value,
    }) {
      return Expanded(
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            color: cs.surfaceContainerHighest.withValues(alpha: 0.65),
            border: Border.all(
              color: cs.outlineVariant.withValues(alpha: 0.42),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
            child: Column(
              children: [
                Icon(icon, color: iconColor, size: 26),
                const SizedBox(height: 10),
                Text(
                  '$value',
                  style: tt.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  label,
                  textAlign: TextAlign.center,
                  style: tt.labelSmall?.copyWith(
                    color: cs.onSurfaceVariant,
                    height: 1.25,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            cs.primaryContainer.withValues(alpha: 0.28),
            cs.surfaceContainerHighest.withValues(alpha: 0.85),
          ],
        ),
        border: Border.all(color: cs.outlineVariant.withValues(alpha: 0.48)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.18),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.insights_rounded, color: cs.primary, size: 22),
                const SizedBox(width: 10),
                Text(
                  context.t('shift.summary.title'),
                  style: tt.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.3,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                metric(
                  icon: Icons.assignment_turned_in_rounded,
                  iconColor: cs.primary,
                  label: context.t('shift.metric.assigned'),
                  value: summary.totalAssigned,
                ),
                const SizedBox(width: 10),
                metric(
                  icon: Icons.done_all_rounded,
                  iconColor: const Color(0xFF34C759),
                  label: context.t('shift.metric.delivered'),
                  value: summary.delivered,
                ),
                const SizedBox(width: 10),
                metric(
                  icon: Icons.warning_amber_rounded,
                  iconColor: const Color(0xFFFF9F0A),
                  label: context.t('shift.metric.problematic'),
                  value: summary.problematic,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ShiftClosePanel extends StatelessWidget {
  const _ShiftClosePanel({required this.controller});

  final CourierAppController controller;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final isClosed = controller.currentShift?.status == 'closed';

    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: LinearGradient(
          colors: [
            cs.errorContainer.withValues(alpha: 0.22),
            cs.surfaceContainerHighest.withValues(alpha: 0.88),
          ],
        ),
        border: Border.all(
          color: cs.outlineVariant.withValues(alpha: 0.5),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.16),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    color: cs.error.withValues(alpha: 0.12),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Icon(
                      Icons.logout_rounded,
                      color: cs.error.withValues(alpha: 0.9),
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
                        context.t('shift.close.title'),
                        style: tt.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        context.t('shift.close.body1'),
                        style: tt.bodyMedium?.copyWith(height: 1.38),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        context.t('shift.close.body2'),
                        style: tt.bodySmall?.copyWith(
                          color: cs.onSurfaceVariant,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: isClosed
                    ? null
                    : () async {
                        final confirm = await showDialog<bool>(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(22),
                            ),
                            title: Text(context.t('shift.close.confirm_title')),
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
                        try {
                          await controller.closeShift(
                            force: false,
                            note: context.t('shift.close.default_note'),
                          );
                          if (!context.mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(context.t('shift.closed_snack')),
                            ),
                          );
                        } on ApiException catch (e) {
                          if (!context.mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(e.message),
                              backgroundColor: cs.error,
                            ),
                          );
                        } catch (e) {
                          if (!context.mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                tr(context.t('common.error_with_message'), {
                                  'error': e.toString(),
                                }),
                              ),
                              backgroundColor: cs.error,
                            ),
                          );
                        }
                      },
                icon: Icon(
                  isClosed ? Icons.check_circle_rounded : Icons.lock_clock_rounded,
                  size: 22,
                ),
                label: Text(
                  isClosed
                      ? context.t('shift.already_closed')
                      : context.t('shift.close.action'),
                ),
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
