import 'package:flutter/material.dart';

import '../../../core/i18n/app_i18n.dart';
import '../application/courier_app_controller.dart';

/// Блокирует работу с задачами, пока курьер явно не открыл смену.
class ShiftStartGateOverlay extends StatelessWidget {
  const ShiftStartGateOverlay({super.key, required this.controller});

  final CourierAppController controller;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final busy = controller.loading || controller.syncing;

    return Material(
      color: Colors.black.withValues(alpha: 0.65),
      child: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Icon(
                        Icons.schedule_rounded,
                        size: 48,
                        color: colorScheme.primary,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        context.t('shift.gate.title'),
                        textAlign: TextAlign.center,
                        style: theme.textTheme.titleLarge,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        context.t('shift.gate.body'),
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                      ),
                      if (controller.error != null) ...[
                        const SizedBox(height: 16),
                        Text(
                          controller.error!,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: colorScheme.error,
                          ),
                        ),
                      ],
                      const SizedBox(height: 24),
                      if (busy)
                        const Center(
                          child: Padding(
                            padding: EdgeInsets.all(12),
                            child: CircularProgressIndicator(),
                          ),
                        )
                      else
                        FilledButton(
                          onPressed: () async {
                            try {
                              await controller.beginShift();
                            } catch (_) {}
                          },
                          child: Text(context.t('shift.gate.start_button')),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
